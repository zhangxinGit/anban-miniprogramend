import { roleStore } from '../../store/roleStore';
import { displayModeStore, type DisplayMode } from '../../store/displayModeStore';
import { getBoundPhone, getToken, isLoggedIn, clearAuth } from '../../utils/auth';
import { USER_ROLES, type UserRole, isManagementRole, managementRoleLabel } from '../../shared/roles';
import { loginWithWeChat } from '../../services/wechatAuth';
import { syncMe, uploadAvatar } from '../../services/appMe';
import { refreshSession } from '../../services/sessionAuth';
import { createFamilyInvite, getPendingFamilyInviteUrl } from '../../services/familyInvitation';
import {
  applyPendingReferral,
  bindReferralCode,
  clearPendingReferralCode,
  fetchReferralMine,
  getPendingReferralCode,
  normalizeReferralCode,
} from '../../services/referral';
import { devSkipLogin, type DevAuthMode } from '../../services/devSkipLogin';
import { isDevelopEnv } from '../../utils/env';
import { setDevOfflineFallback } from '../../utils/devFallback';
import { getApiBaseUrl } from '../../config/api';
import { getLastRequestTraceId } from '../../utils/request';
import { getFamilyProfile, isFamilyAdmin, type FamilyMember } from '../../services/familyProfile';
import { getCurrentServiceBooking, type ServiceBooking } from '../../services/serviceBooking';
import { showAppModal } from '../../utils/modal';
import { resolveDisplayModeData } from '../../utils/displayMode';
import { clearStaffSession, ensureStaffSession } from '../../utils/staffAuth';
import { maskPhone } from '../../utils/phone';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import {
  consumeAssessmentPopup,
  clearAssessmentPopup,
  shouldShowPopupForLoggedInUser,
  recordPopupShown,
  markSessionClosed,
  syncAssessmentCompletedFromServer,
} from '../../utils/assessmentPopup';
import { getErrorMessage } from '../../utils/errorMessage';

const PROFILE_KEY = 'ab_wx_profile';
const INVITE_EXPIRING_SOON_MS = 15_000;

type MineFamilyMemberView = {
  id: string;
  badge: string;
  badgeTone: string;
  avatarTone: string;
  avatarUrl: string;
  avatarText: string;
  useImage: boolean;
};

type LocalProfile = {
  nickName?: string;
  avatarUrl?: string;
};

type PhoneNumberEvent = {
  detail?: {
    errMsg?: string;
    code?: string;
    encryptedData?: string;
    iv?: string;
  };
};

type ModeSwitchEvent = {
  currentTarget?: {
    dataset?: {
      mode?: string;
    };
  };
};

type TabBarHost = {
  getTabBar?: () => unknown;
};

type MinePageCustom = {
  _pageHidden?: boolean;
  _codeTimer?: ReturnType<typeof setInterval> | null;
  _inviteTimer?: ReturnType<typeof setTimeout> | null;
};

let unsubscribeRoleStore: (() => void) | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function shouldClearPendingReferral(message: string): boolean {
  return /邀请码无效|不能绑定自己的邀请码|已绑定推荐人/i.test(message || '');
}

function syncTabBarSelection(page: TabBarHost) {
  const tabBar = page.getTabBar?.();
  if (!isRecord(tabBar)) {
    return;
  }

  const setSelectedByRoute = tabBar['setSelectedByRoute'];
  if (typeof setSelectedByRoute === 'function') {
    setSelectedByRoute.call(tabBar);
  }
}

function loadLocalProfile(): LocalProfile {
  try {
    const value: unknown = wx.getStorageSync(PROFILE_KEY);
    if (!isRecord(value)) {
      return {};
    }
    return {
      nickName: readOptionalString(value['nickName']),
      avatarUrl: readOptionalString(value['avatarUrl']),
    };
  } catch {
    return {};
  }
  return {};
}

function saveLocalProfile(p: LocalProfile) {
  try {
    // 合并现有数据，避免用空值覆盖已存储的有效数据（如头像 URL）
    const existing = loadLocalProfile();
    const merged: LocalProfile = {
      nickName: p.nickName !== undefined && p.nickName !== '' ? p.nickName : existing.nickName,
      avatarUrl: p.avatarUrl !== undefined && p.avatarUrl !== '' ? p.avatarUrl : existing.avatarUrl,
    };
    wx.setStorageSync(PROFILE_KEY, merged);
  } catch {
    return;
  }
}

async function getWechatProfile(): Promise<LocalProfile> {
  return await new Promise((resolve) => {
    if (!wx.getUserProfile) {
      resolve({});
      return;
    }
    wx.getUserProfile({
      desc: '用于完善头像与昵称',
      success: (res) => {
        const userInfo: Record<string, unknown> = isRecord(res.userInfo) ? res.userInfo : {};
        resolve({
          nickName: readOptionalString(userInfo['nickName']) || '',
          avatarUrl: readOptionalString(userInfo['avatarUrl']) || '',
        });
      },
      fail: () => resolve({}),
    });
  });
}

function isUserDeniedPhoneAuth(errMsg: string): boolean {
  const msg = (errMsg || '').toLowerCase();
  return msg.includes('user deny') || msg.includes('user cancel') || msg.includes('auth deny');
}

function isPhoneAuthPermissionError(errMsg: string): boolean {
  const msg = (errMsg || '').toLowerCase();
  return msg.includes('operatewxdata:fail') || msg.includes('jsapi has no permission');
}

function normalizePhoneAuthError(errMsg: string): string {
  const msg = (errMsg || '').trim();
  if (!msg) return '未获取到手机号授权结果';
  if (isUserDeniedPhoneAuth(msg)) return '你已取消手机号授权';
  if (isPhoneAuthPermissionError(msg)) return '当前小程序未开通微信手机号权限';
  return msg.replace(/^getphonenumber:/i, '').trim() || '手机号授权失败';
}

function resolveDisplayMineName(name: string): string {
  const normalized = (name || '').trim();
  if (!normalized || normalized === '微信用户') {
    return '安伴用户';
  }
  return normalized;
}

/**
 * 将后端返回的相对路径头像 URL 转为小程序可用的完整 HTTPS URL。
 * 如果已经是完整 URL（以 http 开头）则原样返回。
 */
function resolveAvatarDisplayUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return getApiBaseUrl() + (trimmed.startsWith('/') ? trimmed : '/' + trimmed);
}

function formatInviteExpireLabel(expiresAt: string): string {
  const ts = Date.parse(expiresAt || '');
  if (!Number.isFinite(ts)) return '24小时内有效，过期后需重新生成';
  const date = new Date(ts);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function buildFamilyMemberView(
  member: FamilyMember,
  index: number,
  mePhone: string,
  avatarUrl: string,
  nickName: string
): MineFamilyMemberView {
  const memberPhone = (member.phone || '').trim();
  const isSelf = Boolean(mePhone && memberPhone && mePhone === memberPhone);
  const memberName = (member.name || '').trim() || (isSelf ? resolveDisplayMineName(nickName) : (memberPhone ? memberPhone.slice(-4) : '家'));

  let badge = '成员';
  let badgeTone = 'is-member';
  if (member.role === 'ADMIN' && isSelf) {
    badge = '我/管理员';
    badgeTone = 'is-admin';
  } else if (member.role === 'ADMIN') {
    badge = '管理员';
    badgeTone = 'is-admin';
  } else if (isSelf) {
    badge = '我/成员';
    badgeTone = 'is-self';
  }

  return {
    id: member.id,
    badge,
    badgeTone,
    avatarTone: `tone-${(index % 4) + 1}`,
    avatarUrl: isSelf ? avatarUrl : '',
    avatarText: memberName.slice(0, 1).toUpperCase(),
    useImage: Boolean(isSelf && avatarUrl),
  };
}

function extractStageLabel(message: string): string {
  const match = message.match(/\[stage:([^\]]+)\]/i);
  const stage = (match?.[1] || '').trim().toLowerCase();
  if (!stage) return '未识别';
  if (stage === 'phone.auth') return '手机号授权凭证';
  if (stage === 'wx.login') return '微信登录 code';
  if (stage === 'auth.request') return '请求登录接口';
  return stage;
}

function stripDebugMarkers(message: string): string {
  return message.replace(/\s*\[(stage|trace):[^\]]+\]/gi, '').trim();
}

Page({
  data: {
    role: roleStore.getState().role as UserRole,
    isVisitor: roleStore.getState().role === USER_ROLES.VISITOR,
    hasToken: isLoggedIn(),
    /** 仅游客且未登录 */
    showLogin: false,
    /** 是否已同意隐私协议 */
    agreedPrivacy: false,
    /** 文档浮层 */
    docOverlayVisible: false,
    docOverlayTitle: '',
    docType: '',
    showAccount: false,
    showRoleCard: false,
    showWorkbenchEntry: false,
    managementRoleLabel: '管理人员',

    phone: '',
    code: '',
    codeSeconds: 0,
    sending: false,
    loginLoading: false,
    displayPhone: '',
    displayPhoneMask: '',
    needBindPhone: false,
    nickName: '微信用户',
    displayMineName: '安伴用户',
    avatarUrl: '',
    showReAuthPopup: false,

    familyLoading: false,
    familyError: '',
    familyAddress: '',
    familyMemberCount: 0,
    familyMembers: [] as MineFamilyMemberView[],
    currentServiceBooking: null as ServiceBooking | null,
    familyCanEdit: false,
    familyShowInvite: false,
    familyInvitePopupVisible: false,
    familyInviteLoading: false,
    familyInviteReady: false,
    familyInviteSharePath: '',
    familyInviteExpiresAt: '',
    familyInviteExpiresLabel: '',
    familyInviteOwnerName: '',

    referralLoading: false,
    referralError: '',
    referralPopupVisible: false,
    referralInviteCode: '',
    referralSharePath: '',
    referralQrImageDataUrl: '',
    referralBound: false,
    referralReferrerName: '',
    referralReferrerPhone: '',
    referralReferrerPhoneMask: '',
    referralInputCode: '',
    referralBindLoading: false,

    // 开发版：一键切换模式
    showDevModeSwitcher: false,
    lastTraceId: '',
    lastLoginStage: '未发起',
    lastLoginErrorMessage: '',
    /** 评估强提醒弹窗 */
    showAssessmentPopup: false,
  },

  _inviteTimer: null as ReturnType<typeof setTimeout> | null,

  noop() {},

  onLoad() {
    const p = loadLocalProfile();
    if (p.nickName || p.avatarUrl) {
      this.setData({
        nickName: typeof p.nickName === 'string' && p.nickName ? p.nickName : this.data.nickName,
        displayMineName: resolveDisplayMineName(typeof p.nickName === 'string' ? p.nickName : this.data.nickName),
        avatarUrl: typeof p.avatarUrl === 'string' ? resolveAvatarDisplayUrl(p.avatarUrl) : this.data.avatarUrl,
      });
    }
    unsubscribeRoleStore = roleStore.subscribe((role) => {
      this.applyAuthView(role);
    });
    this.applyAuthView(roleStore.getState().role);
    void Promise.all([this.reloadFamilySummary(), this.reloadCurrentServiceBooking(), this.loadReferralCenter()]);
  },

  onUnload() {
    if (unsubscribeRoleStore) {
      unsubscribeRoleStore();
      unsubscribeRoleStore = null;
    }
    markPageDead(this as MinePageCustom);
    this.clearCodeTimer();
    this.clearInviteTimer();
  },

  onHide() {
    markPageDead(this as MinePageCustom);
    // 页面隐藏时清除倒计时定时器，避免后台持续 setData 消耗资源
    this.clearCodeTimer();
  },

  onShow() {
    markPageAlive(this as MinePageCustom);
    syncTabBarSelection(this as TabBarHost);
    // 重置认证重试标记，允许新的 onShow 生命周期重新尝试
    this._familyRetried = false;

    // 后台静默刷新用户信息，不阻塞 onShow 返回（消除切 Tab 卡顿）
    void this._silentSyncProfile();
    // 后台静默刷新业务数据
    void this._silentRefreshData();
    this.refreshInviteStatus();
    this.scheduleInviteExpiryRefresh();
    // 登录后检查是否需要弹出评估提醒（扫码进入 → 未登录跳转「我的」→ 登录成功后弹）
    this.checkAssessmentPopupAfterLogin();
  },

  /** 后台静默同步用户信息（不阻塞 UI） */
  async _silentSyncProfile() {
    const me = await syncMe().catch(() => undefined);
    if ((this as MinePageCustom)._pageHidden) return;
    const page = this as unknown as MinePageCustom;
    console.log('[Mine] onShow syncMe result:', JSON.stringify(me), 'current avatarUrl=', this.data.avatarUrl);
    if (me && (me.nickName || me.avatarUrl)) {
      const nextNickName = (me.nickName || this.data.nickName || '').trim();
      const serverAvatar = (typeof me.avatarUrl === 'string' && me.avatarUrl.trim()) ? me.avatarUrl.trim() : '';
      const rawAvatarUrl = serverAvatar || this.data.avatarUrl || '';
      const nextAvatarUrl = resolveAvatarDisplayUrl(rawAvatarUrl.trim());
      const nextProfile = {
        nickName: nextNickName || this.data.nickName,
        displayMineName: resolveDisplayMineName(nextNickName || this.data.nickName),
        avatarUrl: nextAvatarUrl || this.data.avatarUrl,
      };
      safeSetData(page, nextProfile);
      if (nextProfile.avatarUrl) {
        saveLocalProfile({
          nickName: nextProfile.nickName,
          avatarUrl: nextProfile.avatarUrl,
        });
      } else {
        saveLocalProfile({
          nickName: nextProfile.nickName || this.data.nickName,
        });
      }
    }
  },

  /** 后台静默刷新业务数据（不阻塞 UI） */
  async _silentRefreshData() {
    await this.consumePendingReferral();
    if ((this as MinePageCustom)._pageHidden) return;
    this.applyAuthView(roleStore.getState().role);
    if ((this as MinePageCustom)._pageHidden) return;
    await Promise.all([this.reloadFamilySummary(), this.reloadCurrentServiceBooking(), this.loadReferralCenter()]);
  },

  onShareAppMessage() {
    if (this.data.referralPopupVisible && this.data.referralSharePath) {
      return {
        title: this.data.displayMineName ? `${this.data.displayMineName}邀请你完成居家安全自查` : '邀请你完成居家安全自查',
        path: this.data.referralSharePath,
        success: () => {
          this.setData({ referralPopupVisible: false });
          wx.showToast({ title: '请在微信中完成发送', icon: 'none' });
        },
        fail: () => {
          wx.showToast({ title: '未完成分享', icon: 'none' });
        },
      };
    }
    return {
      title: this.data.familyInviteOwnerName
        ? `${this.data.familyInviteOwnerName}邀请你加入家庭`
        : '邀请你加入家庭',
      path: this.data.familyInviteSharePath || '/pages/mine/index',
      success: () => {
        this.setData({ familyInvitePopupVisible: false });
        wx.showToast({ title: '请在微信中完成发送', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '未完成分享', icon: 'none' });
      },
    };
  },

  applyAuthView(role: UserRole) {
    const hasToken = Boolean(getToken());
    // 预成交用户（留资/获客）服务页逻辑统一：只要已登录就进入同一套“已登录服务页”
    // 是否游客视图，仅以“是否登录”为准（避免微信获客登录仍被当成游客页）
    const isVisitor = !hasToken;
    const showLogin = !hasToken;
    const showAccount = hasToken;
    const showRoleCard = false;
    const showWorkbenchEntry = hasToken && isManagementRole(role);
    const bp = getBoundPhone() || '';
    this.setData({
      role,
      isVisitor,
      hasToken,
      showLogin,
      showAccount,
      showRoleCard,
      showWorkbenchEntry,
      managementRoleLabel: managementRoleLabel(role),
      displayPhone: bp,
      displayPhoneMask: maskPhone(bp) || '—',
      // 游客只允许通过微信获取手机号，因此这里不再展示“绑定手机号”流程
      needBindPhone: false,
      showDevModeSwitcher: isDevelopEnv(),
    });
    if (!hasToken) {
      this.resetFamilySummary();
      this.resetReferralCenter();
      this.setData({ currentServiceBooking: null });
    }
  },

  resetFamilySummary() {
    this.clearInviteTimer();
    this.setData({
      familyLoading: false,
      familyError: '',
      familyAddress: '',
      familyMemberCount: 0,
      familyMembers: [],
      familyCanEdit: false,
      familyShowInvite: false,
      familyInvitePopupVisible: false,
      familyInviteLoading: false,
      familyInviteReady: false,
      familyInviteSharePath: '',
      familyInviteExpiresAt: '',
      familyInviteExpiresLabel: '',
      familyInviteOwnerName: '',
    });
  },

  resetReferralCenter() {
    this.setData({
      referralLoading: false,
      referralError: '',
      referralPopupVisible: false,
      referralInviteCode: '',
      referralSharePath: '',
      referralQrImageDataUrl: '',
      referralBound: false,
      referralReferrerName: '',
      referralReferrerPhone: '',
      referralReferrerPhoneMask: '',
      referralInputCode: '',
      referralBindLoading: false,
    });
  },

  async loadReferralCenter() {
    const page = this as unknown as MinePageCustom;
    if (!getToken()) {
      this.resetReferralCenter();
      return;
    }
    this.setData({ referralLoading: true, referralError: '' });
    try {
      const referral = await fetchReferralMine();
      if (page._pageHidden) return;
      safeSetData(page, {
        referralLoading: false,
        referralError: '',
        referralInviteCode: referral.inviteCode,
        referralSharePath: referral.sharePath,
        referralQrImageDataUrl: referral.qrImageDataUrl,
        referralBound: referral.bound,
        referralReferrerName: referral.referrerName,
        referralReferrerPhone: referral.referrerPhone,
        referralReferrerPhoneMask: maskPhone(referral.referrerPhone) || referral.referrerPhone,
      });
    } catch (error: unknown) {
      if (page._pageHidden) return;
      safeSetData(page, {
        referralLoading: false,
        referralError: getErrorMessage(error, '推荐入口加载失败'),
      });
    }
  },

  async consumePendingReferral(bindSource = 'share') {
    const pendingCode = getPendingReferralCode();
    if (!pendingCode || !getToken()) {
      return false;
    }
    try {
      const result = await applyPendingReferral(bindSource);
      if (!result || (this as MinePageCustom)._pageHidden) {
        return false;
      }
      await this.loadReferralCenter();
      if ((this as MinePageCustom)._pageHidden) return true;
      wx.showToast({
        title: result.alreadyBound ? '推荐关系已存在' : '已建立推荐关系',
        icon: 'none',
      });
      return true;
    } catch (error: unknown) {
      if ((this as MinePageCustom)._pageHidden) return false;
      const message = getErrorMessage(error, '推荐关系绑定失败');
      if (shouldClearPendingReferral(message)) {
        clearPendingReferralCode();
      }
      wx.showToast({ title: message, icon: 'none' });
      return false;
    }
  },

  async bindReferral(inviteCode: string, bindSource: 'manual' | 'scan') {
    const page = this as unknown as MinePageCustom;
    const normalizedCode = normalizeReferralCode(inviteCode);
    if (!normalizedCode) {
      wx.showToast({ title: '请输入有效邀请码', icon: 'none' });
      return false;
    }
    this.setData({ referralBindLoading: true });
    try {
      const result = await bindReferralCode(normalizedCode, bindSource);
      if (page._pageHidden) return false;
      safeSetData(page, { referralInputCode: '' });
      await this.loadReferralCenter();
      if (page._pageHidden) return true;
      wx.showToast({
        title: result.alreadyBound ? '推荐关系已存在' : '绑定成功',
        icon: 'none',
      });
      return true;
    } catch (error: unknown) {
      if (!page._pageHidden) {
        wx.showToast({ title: getErrorMessage(error, '绑定失败'), icon: 'none' });
      }
      return false;
    } finally {
      safeSetData(page, { referralBindLoading: false });
    }
  },

  isInviteStillValid() {
    const ts = Date.parse(this.data.familyInviteExpiresAt || '');
    return Number.isFinite(ts) && ts - Date.now() > INVITE_EXPIRING_SOON_MS;
  },

  refreshInviteStatus() {
    if (this.data.familyInviteReady && !this.isInviteStillValid()) {
      this.clearInviteTimer();
      this.setData({
        familyInvitePopupVisible: false,
        familyInviteLoading: false,
        familyInviteReady: false,
        familyInviteSharePath: '',
        familyInviteExpiresAt: '',
        familyInviteExpiresLabel: '',
        familyInviteOwnerName: '',
      });
    }
  },

  clearInviteTimer() {
    if (this._inviteTimer) {
      clearTimeout(this._inviteTimer);
      this._inviteTimer = null;
    }
  },

  scheduleInviteExpiryRefresh() {
    this.clearInviteTimer();
    if (!this.data.familyInviteReady) return;
    const ts = Date.parse(this.data.familyInviteExpiresAt || '');
    if (!Number.isFinite(ts)) return;
    const delay = Math.max(0, ts - Date.now() + 500);
    const page = this as unknown as MinePageCustom;
    page._inviteTimer = setTimeout(() => {
      page._inviteTimer = null;
      if (page._pageHidden) return;
      this.refreshInviteStatus();
    }, delay);
  },

  async prepareFamilyInvite(force = false) {
    if (!this.data.familyShowInvite || this.data.familyInviteLoading) {
      return;
    }
    this.refreshInviteStatus();
    if (!force && this.data.familyInviteReady && this.isInviteStillValid()) {
      this.setData({ familyInvitePopupVisible: true });
      return;
    }

    this.clearInviteTimer();
    this.setData({ familyInviteLoading: true });
    try {
      const invite = await createFamilyInvite();
      this.setData({
        familyInvitePopupVisible: true,
        familyInviteLoading: false,
        familyInviteReady: true,
        familyInviteSharePath: invite.path,
        familyInviteExpiresAt: invite.expiresAt,
        familyInviteExpiresLabel: formatInviteExpireLabel(invite.expiresAt),
        familyInviteOwnerName: invite.ownerName || this.data.displayMineName,
      });
      this.scheduleInviteExpiryRefresh();
    } catch (error: unknown) {
      this.setData({
        familyInviteLoading: false,
        familyInviteReady: false,
        familyInviteSharePath: '',
        familyInviteExpiresAt: '',
        familyInviteExpiresLabel: '',
        familyInviteOwnerName: '',
      });
      wx.showToast({ title: getErrorMessage(error, '邀请链接生成失败'), icon: 'none' });
    }
  },

  async reloadFamilySummary() {
    const page = this as unknown as MinePageCustom;
    if (!getToken()) {
      this.resetFamilySummary();
      return;
    }

    this.setData({ familyLoading: true, familyError: '' });
    try {
      const profile = await getFamilyProfile(this.data.role);
      if (page._pageHidden) return;
      const mePhone = (getBoundPhone() || '').trim();
      const admin = isFamilyAdmin(profile);
      const familyMembers = profile.members.map((member, index) => buildFamilyMemberView(member, index, mePhone, this.data.avatarUrl, this.data.nickName)).slice(0, 4);
      safeSetData(page, {
        familyLoading: false,
        familyError: '',
        familyAddress: (profile.family.address || '').trim(),
        familyMemberCount: profile.members.length,
        familyMembers,
        familyCanEdit: admin,
        familyShowInvite: admin,
      });
      if (!admin) {
        this.clearInviteTimer();
        safeSetData(page, {
          familyInvitePopupVisible: false,
          familyInviteLoading: false,
          familyInviteReady: false,
          familyInviteSharePath: '',
          familyInviteExpiresAt: '',
          familyInviteExpiresLabel: '',
          familyInviteOwnerName: '',
        });
      } else {
        this.refreshInviteStatus();
        this.scheduleInviteExpiryRefresh();
      }
    } catch (error: unknown) {
      const errCode = (error as { code?: string | number })?.code;
      const isAuthErr = errCode === 401 || errCode === 403 || errCode === '401' || errCode === '403'
          || errCode === 40002 || errCode === 40300;

      // 如果是 401/403，尝试刷新 token 后重试一次（最多一次，防止权限不足导致无限循环）
      if (isAuthErr && getToken() && !this._familyRetried) {
        this._familyRetried = true;
        try {
          const refreshed = await refreshSession(true);
          if (refreshed) {
            return this.reloadFamilySummary();
          }
        } catch {
          // 刷新失败，继续走错误处理
        }
      }

      // 重置重试标记（下次 onShow 触发时允许重新尝试）
      this._familyRetried = false;

      if (page._pageHidden) return;
      this.clearInviteTimer();
      const finalMsg = isAuthErr ? '暂无家庭访问权限，请联系管理员' : getErrorMessage(error, '暂未建立家庭档案');
      safeSetData(page, {
        familyLoading: false,
        familyError: finalMsg,
        familyAddress: '',
        familyMemberCount: 0,
        familyMembers: [],
        familyCanEdit: false,
        familyShowInvite: false,
        familyInvitePopupVisible: false,
        familyInviteLoading: false,
        familyInviteReady: false,
        familyInviteSharePath: '',
        familyInviteExpiresAt: '',
        familyInviteExpiresLabel: '',
        familyInviteOwnerName: '',
      });
    }
  },

  async reloadCurrentServiceBooking() {
    const page = this as unknown as MinePageCustom;
    if (!getToken()) {
      safeSetData(page, { currentServiceBooking: null });
      return;
    }
    try {
      const currentServiceBooking = await getCurrentServiceBooking();
      if (page._pageHidden) return;
      safeSetData(page, { currentServiceBooking });
    } catch {
      if (!page._pageHidden) {
        safeSetData(page, { currentServiceBooking: null });
      }
    }
  },

  onReAuth() {
    this.setData({ showReAuthPopup: true });
  },

  onReAuthCancel() {
    this.setData({ showReAuthPopup: false });
  },

  onReAuthConfirm() {
    this.setData({ showReAuthPopup: false });
    clearAuth();
    clearStaffSession();
    roleStore.setRole(USER_ROLES.VISITOR);
    this.setData({ phone: '', code: '' });
    this.clearCodeTimer();
    this.setData({ codeSeconds: 0 });
    this.applyAuthView(USER_ROLES.VISITOR);
  },

  onAltPhonePage() {
    wx.navigateTo({ url: '/pages/alt-phone-login/index' });
  },

  onAltPhoneLoginWithCheck() {
    if (!this.data.agreedPrivacy) {
      wx.showToast({ title: '请先同意用户隐私保护政策', icon: 'none' });
      return;
    }
    this.onAltPhonePage();
  },

  onTogglePrivacyAgreement() {
    this.setData({ agreedPrivacy: !this.data.agreedPrivacy });
  },

  onOpenPrivacyPolicy() {
    this.setData({
      docOverlayVisible: true,
      docOverlayTitle: '用户隐私保护政策',
      docType: 'privacy',
    });
  },

  onOpenUserAgreement() {
    this.setData({
      docOverlayVisible: true,
      docOverlayTitle: '用户服务协议',
      docType: 'agreement',
    });
  },

  onCloseDocOverlay() {
    this.setData({ docOverlayVisible: false, docType: '' });
  },

  onChangePhone() {
    this.onAltPhonePage();
  },

  async onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
    const tempAvatarUrl = e?.detail?.avatarUrl;
    if (!tempAvatarUrl) return;

    try {
      wx.showLoading({ title: '保存中...', mask: true });
      const permanentUrl = await uploadAvatar(tempAvatarUrl);
      const displayUrl = resolveAvatarDisplayUrl(permanentUrl);
      console.log('[Mine] 上传成功 permanentUrl=', permanentUrl, 'displayUrl=', displayUrl);
      wx.hideLoading();

      // 同步更新页面和本地缓存（本地缓存存相对路径，保持环境无关）
      this.setData({ avatarUrl: displayUrl });
      saveLocalProfile({
        nickName: this.data.nickName,
        avatarUrl: permanentUrl,
      });
      wx.showToast({ title: '头像已更新', icon: 'success' });

      // 验证：立即检查图片是否可加载
      wx.getImageInfo({
        src: displayUrl,
        success: (info) => { console.log('[Mine] 图片验证成功:', info.width, 'x', info.height); },
        fail: (err) => { console.error('[Mine] 图片验证失败! URL=', displayUrl, err); },
      });
    } catch (error: unknown) {
      wx.hideLoading();
      const msg = error instanceof Error ? error.message : '头像保存失败';
      console.error('[Mine] 上传失败:', msg);
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  onAvatarError(e: WechatMiniprogram.CustomEvent) {
    console.warn('[Mine] 头像图片加载失败! src=', this.data.avatarUrl, 'err=', e.detail?.errMsg || e.detail);
    wx.showToast({ title: '头像加载失败', icon: 'none' });
  },

  async onOpenWorkbench() {
    const ok = await ensureStaffSession('/pages/staff-workbench/index');
    if (ok) {
      wx.navigateTo({ url: '/pages/staff-workbench/index' });
    }
  },

  onSwitchDisplayMode(e: WechatMiniprogram.BaseEvent) {
    const nextMode = e.currentTarget?.dataset?.mode === 'standard' ? 'standard' : 'aged';
    this.setData(resolveDisplayModeData(nextMode as DisplayMode));
    displayModeStore.setMode(nextMode as DisplayMode);
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  clearCodeTimer() {
    const page = this as unknown as MinePageCustom;
    if (page._codeTimer) {
      clearInterval(page._codeTimer);
      page._codeTimer = null;
    }
  },

  startCodeCountdown() {
    this.clearCodeTimer();
    this.setData({ codeSeconds: 60 });
    const page = this as unknown as MinePageCustom;
    page._codeTimer = setInterval(() => {
      if (page._pageHidden) {
        clearInterval(page._codeTimer!);
        page._codeTimer = null;
        return;
      }
      const s = this.data.codeSeconds - 1;
      if (s <= 0) {
        this.clearCodeTimer();
        this.setData({ codeSeconds: 0 });
        return;
      }
      safeSetData(page, { codeSeconds: s });
    }, 1000);
  },

  async onGetPhoneNumber(e: PhoneNumberEvent) {
    if (this.data.loginLoading) return;
    if (!this.data.agreedPrivacy) {
      wx.showToast({ title: '请先同意用户隐私保护政策', icon: 'none' });
      return;
    }
    this.setData({ loginLoading: true, lastLoginStage: '开始授权', lastLoginErrorMessage: '' });
    try {
      const errMsg = typeof e?.detail?.errMsg === 'string' ? e.detail.errMsg : '';
      const phoneCode = typeof e?.detail?.code === 'string' ? e.detail.code.trim() : '';
      const encryptedData = typeof e?.detail?.encryptedData === 'string' ? e.detail.encryptedData.trim() : '';
      const iv = typeof e?.detail?.iv === 'string' ? e.detail.iv.trim() : '';
      console.info('onGetPhoneNumber detail', {
        errMsg,
        hasPhoneCode: Boolean(phoneCode),
        hasEncryptedData: Boolean(encryptedData),
        hasIv: Boolean(iv),
      });

      if (isPhoneAuthPermissionError(errMsg)) {
        showAppModal({
          title: '无法获取微信手机号',
          content: '当前小程序 AppID 还没有 getPhoneNumber 权限，微信不会下发手机号凭证。你可以先改用其他手机号登录，同时检查是否使用了已认证并开通手机号能力的小程序。',
          confirmText: '其他手机号登录',
          cancelText: '我知道了',
          success: (res) => {
            if (res.confirm) {
              this.onAltPhonePage();
            }
          },
        });
        return;
      }

      if (errMsg.includes('fail') && !phoneCode && !(encryptedData && iv)) {
        this.setData({ lastLoginStage: '手机号授权凭证', lastLoginErrorMessage: normalizePhoneAuthError(errMsg) });
        wx.showToast({ title: normalizePhoneAuthError(errMsg), icon: 'none' });
        return;
      }
      if (!phoneCode && !(encryptedData && iv)) {
        this.setData({ lastLoginStage: '手机号授权凭证', lastLoginErrorMessage: '当前微信环境未返回手机号凭证，请在真机重试' });
        wx.showToast({ title: '当前微信环境未返回手机号凭证，请在真机重试', icon: 'none' });
        return;
      }

      this.setData({ lastLoginStage: '获取微信资料' });
      const profile = await getWechatProfile();
      this.setData({ lastLoginStage: '请求登录接口' });
      await loginWithWeChat({
        phoneCode,
        encryptedData,
        iv,
        nickName: profile.nickName,
        avatarUrl: profile.avatarUrl,
      });
      const page = this as unknown as MinePageCustom;
      if (page._pageHidden) return;
      const next = {
        nickName: profile.nickName || this.data.nickName,
        displayMineName: resolveDisplayMineName(profile.nickName || this.data.nickName),
        avatarUrl: profile.avatarUrl || this.data.avatarUrl,
      };
      safeSetData(page, next);
      saveLocalProfile(next);

      wx.showToast({ title: '登录成功', icon: 'success' });
      safeSetData(page, { code: '' });
      const pendingInviteUrl = getPendingFamilyInviteUrl();
      if (pendingInviteUrl) {
        wx.navigateTo({ url: pendingInviteUrl });
        return;
      }
      const referralApplied = await this.consumePendingReferral();
      if (page._pageHidden) return;
      safeSetData(page, { lastLoginStage: '登录成功', lastLoginErrorMessage: '' });
      this.applyAuthView(roleStore.getState().role);
      await Promise.all([this.reloadFamilySummary(), this.reloadCurrentServiceBooking(), this.loadReferralCenter()]);
      if (referralApplied) {
        wx.navigateTo({ url: '/pages/safety-check/index' });
        return;
      }
    } catch (error: unknown) {
      const rawMessage = getErrorMessage(error, '登录失败');
      const nextTraceId = getLastRequestTraceId();
      const nextStage = extractStageLabel(rawMessage);
      const nextMessage = stripDebugMarkers(rawMessage) || '登录失败';
      this.setData({
        lastTraceId: nextTraceId,
        lastLoginStage: nextStage,
        lastLoginErrorMessage: nextMessage,
      });
      wx.showToast({ title: nextMessage, icon: 'none' });
    } finally {
      this.setData({ loginLoading: false });
    }
  },

  onCopyTraceId() {
    const traceId = String(this.data.lastTraceId || '').trim();
    if (!traceId) {
      wx.showToast({ title: '暂无 trace id', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: traceId });
  },

  onLogout() {
    showAppModal({
      title: '退出登录',
      content: '退出后将以游客身份浏览，可再次通过手机号登录。',
      confirmText: '退出',
      tone: 'danger',
      success: (res) => {
        if (!res.confirm) return;
        clearAuth();
        clearStaffSession();
        roleStore.setRole(USER_ROLES.VISITOR);
        this.setData({ phone: '', code: '' });
        this.clearCodeTimer();
        this.setData({ codeSeconds: 0 });
        this.applyAuthView(USER_ROLES.VISITOR);
        this.resetFamilySummary();
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },

  onOpenFamilyProfile() {
    wx.navigateTo({ url: '/pages/family-profile/index' });
  },

  onOpenServiceBookings() {
    wx.navigateTo({ url: '/pages/service-bookings/index' });
  },

  onCallCurrentServiceManager() {
    const phone = this.data.currentServiceBooking?.serviceContact.phone || '18526209432';
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onInviteMembers() {
    void this.prepareFamilyInvite();
  },

  async onOpenReferralPopup() {
    if (this.data.referralLoading) {
      return;
    }
    if (!this.data.referralInviteCode) {
      await this.loadReferralCenter();
    }
    if (!this.data.referralInviteCode) {
      wx.showToast({ title: this.data.referralError || '邀请码加载失败', icon: 'none' });
      return;
    }
    this.setData({ referralPopupVisible: true });
  },

  onCloseReferralPopup() {
    this.setData({ referralPopupVisible: false });
  },

  onCopyReferralCode() {
    const code = String(this.data.referralInviteCode || '').trim();
    if (!code) {
      wx.showToast({ title: '暂无邀请码', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: code });
  },

  onReferralCodeInput(e: WechatMiniprogram.Input) {
    const value = normalizeReferralCode(e?.detail?.value || '');
    this.setData({ referralInputCode: value.slice(0, 16) });
  },

  async onManualBindReferral() {
    if (this.data.referralBound || this.data.referralBindLoading) {
      return;
    }
    await this.bindReferral(this.data.referralInputCode, 'manual');
  },

  onScanBindReferral() {
    if (this.data.referralBindLoading) {
      return;
    }
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        void this.bindReferral(res.result || '', 'scan');
      },
      fail: (error) => {
        const message = typeof error?.errMsg === 'string' ? error.errMsg : '';
        if (/cancel/i.test(message)) {
          return;
        }
        wx.showToast({ title: '扫码失败，请重试', icon: 'none' });
      },
    });
  },

  onCloseInvitePopup() {
    this.setData({ familyInvitePopupVisible: false });
  },

  onRefreshInvitePopup() {
    void this.prepareFamilyInvite(true);
  },

  async onDevSwitchMode(e: ModeSwitchEvent) {
    const mode = String(e?.currentTarget?.dataset?.mode || '');
    if (!mode) return;
    if (this.data.loginLoading) return;

    // 1) 游客：清空 token，回到访客链路
    if (mode === 'VISITOR') {
      clearAuth();
      clearStaffSession();
      roleStore.setRole(USER_ROLES.VISITOR);
      this.setData({ phone: '', code: '' });
      this.clearCodeTimer();
      this.setData({ codeSeconds: 0 });
      this.applyAuthView(USER_ROLES.VISITOR);
      this.resetFamilySummary();
      wx.showToast({ title: '已切到游客模式', icon: 'none' });
      return;
    }

    // 2) 已成交：先清空，再用 dev 登录拿一套 token（mock 模式下不打后端）
    this.setData({ loginLoading: true });
    try {
      clearAuth();
      setDevOfflineFallback(false);
      const m: DevAuthMode = 'DEAL_NO_DEVICE';
      const devPhone = '13900001004';
      await devSkipLogin(m, devPhone);
      wx.showToast({ title: '已切到已成交模式', icon: 'none' });
      const pendingInviteUrl = getPendingFamilyInviteUrl();
      if (pendingInviteUrl) {
        wx.navigateTo({ url: pendingInviteUrl });
        return;
      }
      this.applyAuthView(roleStore.getState().role);
      await this.reloadFamilySummary();
    } catch {
      // 纯前端兜底：后端不可用时也允许切换 UI 链路
      setDevOfflineFallback(true);
      const targetRole =
        mode === 'DEAL_NO_DEVICE' ? USER_ROLES.LEAD : USER_ROLES.VISITOR;
      roleStore.setRole(targetRole);
      wx.showToast({ title: '已离线切换（无后端）', icon: 'none' });
      this.applyAuthView(targetRole);
      if (targetRole === USER_ROLES.VISITOR) {
        this.resetFamilySummary();
        this.setData({ currentServiceBooking: null });
      } else {
        await this.reloadCurrentServiceBooking();
      }
    } finally {
      this.setData({ loginLoading: false });
    }
  },

  onContactAdvisor() {
    const phoneNumber = '18526209432';
    wx.showActionSheet({
      itemList: ['拨打电话 18526209432', '复制微信号 18526209432', '复制手机号 18526209432'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.makePhoneCall({ phoneNumber });
          return;
        }
        if (res.tapIndex === 1) {
          wx.setClipboardData({ data: phoneNumber });
          return;
        }
        if (res.tapIndex === 2) {
          wx.setClipboardData({ data: phoneNumber });
        }
      },
    });
  },

  /* ========== 评估强提醒弹窗（登录后复现）========== */

  /** 检查是否需要弹出评估弹窗（仅已登录时弹） */
  checkAssessmentPopupAfterLogin() {
    if (!getToken()) return; // 未登录不弹
    const signal = consumeAssessmentPopup();
    if (!signal) return;
    // 先从服务端同步评估状态，再执行豁免判断
    syncAssessmentCompletedFromServer().then(() => {
      if (!shouldShowPopupForLoggedInUser()) return;
      recordPopupShown();
      this.setData({ showAssessmentPopup: true });
    });
  },

  /** 弹窗中点击「开始评估」（此时已登录） */
  onMineStartAssessment() {
    this.setData({ showAssessmentPopup: false });
    clearAssessmentPopup();
    wx.navigateTo({ url: '/pages/safety-check/index' });
  },

  /** 弹窗中关闭/稍后评估 */
  onMineCloseAssessmentPopup() {
    this.setData({ showAssessmentPopup: false });
    clearAssessmentPopup();
    // 标记本次会话已关闭，本次不再弹
    markSessionClosed();
  },
});
