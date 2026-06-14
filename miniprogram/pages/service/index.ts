import { roleStore } from '../../store/roleStore';
import { USER_ROLES } from '../../shared/roles';
import type { UserRole } from '../../shared/roles';
import { bindDeviceByCode, getDeviceList, recordEmergencyHelp, type Device } from '../../services/deviceCenter';
import { getAlarmSubscribeConfig, getAlarmSubscribeState, requestAlarmSubscription, sendAlarmSubscribeTest, type AlarmSubscribeState } from '../../services/alarmSubscription';
import { canAccess } from '../../utils/acl';
import { syncMe } from '../../services/appMe';
import { refreshSession } from '../../services/sessionAuth';
import { getToken, getRole } from '../../utils/auth';
import { showAppModal } from '../../utils/modal';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { getErrorMessage } from '../../utils/errorMessage';

/** 设备 Tab：空态 / 已绑定列表（家庭维度由 deviceCenter 过滤） */
type Mode = 'EMPTY_BIND' | 'LIST';

type DeviceCardItem = Device & {
  deviceNoShort: string;
  installLocationText: string;
  statusBadgeText: string;
  statusBadgeClass: string;
  batteryBadgeText: string;
  signalClass: string;
  alarmCount: number;
};

type AlarmSubscribeCard = {
  visible: boolean;
  buttonDisabled: boolean;
  statusText: string;
  hintText: string;
  buttonText: string;
  testButtonVisible: boolean;
};

type ServicePageData = {
  loading: boolean;
  error: string;
  role: UserRole;
  mode: Mode;
  devices: DeviceCardItem[];
  summaryText: string;
  alarmMessageCount: number;
  alarmMessageUnread: boolean;
  visible: {
    bindDevice: boolean;
    batch: boolean;
  };
  binding: boolean;
  bindPopupVisible: boolean;
  bindCode: string;
  alarmSubscribeVisible: boolean;
  alarmSubscribeLoading: boolean;
  alarmSubscribeButtonDisabled: boolean;
  alarmSubscribeStatusText: string;
  alarmSubscribeHintText: string;
  alarmSubscribeButtonText: string;
  alarmSubscribeTestVisible: boolean;
  alarmSubscribeTestLoading: boolean;
};

type TabBarInstance = {
  setSelectedByRoute?: () => void;
};

type DeviceTapEvent = {
  currentTarget?: {
    dataset?: {
      id?: string;
    };
  };
};

type BindCodeInputEvent = {
  detail?: {
    value?: string;
  };
};

type ServicePageCustom = {
  __unsub?: () => void;
  getTabBar?: () => TabBarInstance | undefined;
  setData?(data: Record<string, unknown>, callback?: () => void): void;
  _deviceRetried?: boolean;
  _deviceLoaded?: boolean;
  _reloading?: boolean;
  _pageHidden?: boolean;
  noop(): void;
  refreshVisible(): void;
  reload(): Promise<void>;
  refreshAlarmSubscribeCard(): Promise<void>;
  applyAlarmSubscribeCard(card: AlarmSubscribeCard): void;
  maybeRequestAlarmSubscribeAfterBind(): Promise<AlarmSubscribeState | null>;
  onRetry(): void;
  onPullDownRefresh?(): void;
  onStartBind(): void;
  onCloseBindPopup(): void;
  onBindCodeInput(event: BindCodeInputEvent): void;
  onClearBindCode(): void;
  onConfirmBind(): Promise<void>;
  onRequestAlarmSubscribe(): Promise<void>;
  onSendAlarmSubscribeTest(): Promise<void>;
  onSos(): void;
  onOpenAlarmRecords(): void;
  onOpenDevice(event: DeviceTapEvent): void;
};

function fmtOnline(online: Device['online']) {
  return online === 'ONLINE' ? '在线' : '离线';
}

function formatDeviceNoShort(sn: string) {
  const normalized = String(sn || '').trim();
  return normalized ? normalized.slice(-4) : '--';
}

function resolveInstallLocation(device: Device) {
  const location = String(device.installLocation || '').trim();
  return location || '未设置';
}

function resolveSignalClass(device: Device) {
  if (device.online !== 'ONLINE') return 'offline';
  if ((device.battery?.percent || 0) >= 66) return 'strong';
  if ((device.battery?.percent || 0) >= 33) return 'medium';
  return 'weak';
}

function formatBatteryBadge(percent: number) {
  return `${Math.max(0, Math.min(100, percent | 0))}%`;
}

function resolveAlarmSubscribeCard(
  role: UserRole,
  state: AlarmSubscribeState,
  configEnabled: boolean,
  configError = ''
): AlarmSubscribeCard {
  if (role === USER_ROLES.VISITOR) {
    return {
      visible: false,
      buttonDisabled: true,
      statusText: '',
      hintText: '',
      buttonText: '开启告警提醒',
      testButtonVisible: false,
    };
  }

  if (!configEnabled) {
    return {
      visible: true,
      buttonDisabled: true,
      statusText: '当前环境未开启微信告警提醒',
      hintText: '请先在后台配置微信告警模板和发送开关。',
      buttonText: '暂不可用',
      testButtonVisible: false,
    };
  }

  if (state.status === 'accepted') {
    return {
      visible: true,
      buttonDisabled: false,
      statusText: '已开启微信告警提醒',
      hintText: '设备发生烟雾、SOS 等告警后，将优先通过微信提醒你。',
      buttonText: '重新确认提醒',
      testButtonVisible: true,
    };
  }

  if (state.status === 'rejected') {
    return {
      visible: true,
      buttonDisabled: false,
      statusText: '你还未开启微信告警提醒',
      hintText: '建议现在开启，避免设备告警时只收到短信。',
      buttonText: '重新开启提醒',
      testButtonVisible: false,
    };
  }

  return {
    visible: true,
    buttonDisabled: false,
    statusText: configError || state.message || '尚未开启微信告警提醒',
    hintText: '收到设备告警后，你可以第一时间在微信里收到提醒。',
    buttonText: '开启告警提醒',
    testButtonVisible: false,
  };
}

Page<ServicePageData, ServicePageCustom>({
  data: {
    loading: true,
    error: '',
    role: roleStore.getState().role,
    mode: 'EMPTY_BIND',
    devices: [] as DeviceCardItem[],
    summaryText: '',
    alarmMessageCount: 0,
    alarmMessageUnread: false,
    visible: {
      bindDevice: false,
      batch: false,
    },
    binding: false,
    bindPopupVisible: false,
    bindCode: '',
    alarmSubscribeVisible: false,
    alarmSubscribeLoading: false,
    alarmSubscribeButtonDisabled: false,
    alarmSubscribeStatusText: '',
    alarmSubscribeHintText: '',
    alarmSubscribeButtonText: '开启告警提醒',
    alarmSubscribeTestVisible: false,
    alarmSubscribeTestLoading: false,
  },

  onLoad() {
    const page = this as unknown as ServicePageCustom;
    this.__unsub = roleStore.subscribe((role) => {
      // 页面已死亡时完全跳过，不 setData、不触发任何副作用
      if (page._pageHidden) return;
      page.setData?.({ role });
      this.refreshVisible();
      if (page._reloading) return;
      page._reloading = true;
      this.reload().finally(() => { (this as ServicePageCustom)._reloading = false; });
      void this.refreshAlarmSubscribeCard();
    });
    this.refreshVisible();
    // roleStore.subscribe 注册时已立即触发一次 reload，此处不再重复调用
    // 仅已登录时额外刷新告警订阅卡片
    if (getToken()) {
      void this.refreshAlarmSubscribeCard();
    }
  },

  onUnload() {
    const u = this.__unsub;
    if (typeof u === 'function') u();
    markPageDead(this as ServicePageCustom);
  },

  onHide() {
    // 标记页面隐藏，阻止后台订阅继续触发 reload/setData
    markPageDead(this as ServicePageCustom);
    // 重置加载标记：下次 onShow 时强制重新加载设备列表
    // 解决登录/登出后切回设备 Tab 不刷新的问题
    this._deviceLoaded = false;
  },

  async onShow() {
    // 恢复页面可见标记，允许订阅触发 reload
    markPageAlive(this as ServicePageCustom);

    const tab = this.getTabBar?.();
    if (tab?.setSelectedByRoute) tab.setSelectedByRoute();

    // 已加载过 → 做轻量级刷新（只刷新告警订阅卡片状态），不重复请求设备列表
    if (this._deviceLoaded && !this._reloading) {
      void this.refreshAlarmSubscribeCard();
      return;
    }

    // 正在加载中则跳过
    if (this._reloading) return;

    // 重置认证重试标记，允许新的 onShow 生命周期重新尝试
    this._deviceRetried = false;
    this._reloading = true;

    // 并行执行 syncMe 和 reload（syncMe 更新存储中的 role，reload 直接用存储中的 role 避免依赖 data.role）
    if (getToken()) {
      syncMe()
        .then(() => {
          if (!this._pageHidden) {
            this.setData({ role: roleStore.getState().role });
            this.refreshVisible();
          }
        })
        .catch(() => undefined);
    }

    this.reload().finally(() => { (this as ServicePageCustom)._reloading = false; });
    void this.refreshAlarmSubscribeCard();
  },

  refreshVisible() {
    this.setData({
      visible: {
        bindDevice: canAccess(this.data.role, 'btn.bindDevice'),
        batch: false,
      },
    });
  },

  async reload() {
    const page = this as unknown as ServicePageCustom;
    // 页面隐藏时跳过（防止后台订阅触发无意义的网络请求）
    if (page._pageHidden) return;

    this.setData({ loading: true, error: '' });
    try {
      const list = await getDeviceList(getRole());
      // 网络请求期间页面已隐藏 → 放弃所有后续 setData
      if (page._pageHidden) return;
      const mode: Mode = list.length === 0 ? 'EMPTY_BIND' : 'LIST';

      const devices = list.map((d: Device) => {
        const alarmCount = d.alarm.unreadCount || 0;
        return {
        ...d,
          deviceNoShort: formatDeviceNoShort(d.sn),
          installLocationText: resolveInstallLocation(d),
          statusBadgeText: fmtOnline(d.online),
          statusBadgeClass: d.online === 'ONLINE' ? 'is-online' : 'is-offline',
          batteryBadgeText: formatBatteryBadge(d.battery.percent),
          signalClass: resolveSignalClass(d),
          alarmCount,
        };
      });

      const alarmTotal = devices.reduce((sum, item) => sum + item.alarmCount, 0);
      const abnormalCount = devices.filter((item) => item.online === 'OFFLINE' || item.alarmCount > 0).length;

      this.setData({
        loading: false,
        mode,
        devices,
        alarmMessageCount: alarmTotal,
        alarmMessageUnread: alarmTotal > 0,
        summaryText:
          mode === 'LIST'
            ? `共绑定 ${devices.length} 台设备，共告警 ${alarmTotal} 次，共有 ${abnormalCount} 台设备异常`
            : '暂未绑定设备，绑定后可查看设备状态与历史告警',
      });
      // 标记首次加载完成，后续 onShow 不再自动刷新
      this._deviceLoaded = true;
    } catch (error: unknown) {
      if (page._pageHidden) return;
      const errMsg = getErrorMessage(error, '加载失败');
      const errCode = (error as { code?: string | number })?.code;
      const isAuthErr = errCode === 401 || errCode === 403 || errCode === '401' || errCode === '403'
          || errCode === 40002 || errCode === 40300;

      // 如果是 401/403，尝试刷新 token 后重试一次（最多一次，防止权限不足导致无限循环）
      if (isAuthErr && getToken() && !this._deviceRetried) {
        this._deviceRetried = true;
        try {
          const refreshed = await refreshSession(true);
          if (page._pageHidden) return;
          if (refreshed) {
            return this.reload();
          }
        } catch {
          // 刷新失败，继续走错误处理
        }
      }

      // 重置重试标记（下次 onShow 触发 reload 时允许重新尝试）
      this._deviceRetried = false;

      const finalMsg = isAuthErr ? '暂无访问权限，请联系管理员' : errMsg;

      safeSetData(page, {
        loading: false,
        error: finalMsg,
        alarmMessageCount: 0,
        alarmMessageUnread: false,
        summaryText: '',
      });
    }
  },

  onRetry() {
    this.reload();
    void this.refreshAlarmSubscribeCard();
  },

  onPullDownRefresh() {
    void Promise.all([
      this.reload(),
      this.refreshAlarmSubscribeCard(),
    ]).finally(() => wx.stopPullDownRefresh());
  },

  noop() {},

  async refreshAlarmSubscribeCard() {
    const page = this as unknown as ServicePageCustom;
    // 未登录时不请求告警订阅接口
    if (!getToken()) return;
    const role = this.data.role;
    const stored = getAlarmSubscribeState();
    try {
      const config = await getAlarmSubscribeConfig();
      if (page._pageHidden) return;
      this.applyAlarmSubscribeCard(resolveAlarmSubscribeCard(role, stored, config.enabled));
    } catch (error: unknown) {
      if (page._pageHidden) return;
      this.applyAlarmSubscribeCard(
        resolveAlarmSubscribeCard(
          role,
          stored,
          true,
          getErrorMessage(error, '')
        )
      );
    }
  },

  applyAlarmSubscribeCard(card: AlarmSubscribeCard) {
    this.setData({
      alarmSubscribeVisible: card.visible,
      alarmSubscribeButtonDisabled: card.buttonDisabled,
      alarmSubscribeStatusText: card.statusText,
      alarmSubscribeHintText: card.hintText,
      alarmSubscribeButtonText: card.buttonText,
      alarmSubscribeTestVisible: card.testButtonVisible,
    });
  },

  async maybeRequestAlarmSubscribeAfterBind() {
    const current = getAlarmSubscribeState();
    if (current.status === 'accepted') {
      return current;
    }
    try {
      return await requestAlarmSubscription();
    } catch {
      return null;
    } finally {
      await this.refreshAlarmSubscribeCard();
    }
  },

  onStartBind() {
    if (this.data.binding) return;
    this.setData({ bindPopupVisible: true, bindCode: '' });
  },

  onCloseBindPopup() {
    if (this.data.binding) return;
    this.setData({ bindPopupVisible: false, bindCode: '' });
  },

  onBindCodeInput(event: BindCodeInputEvent) {
    this.setData({ bindCode: String(event?.detail?.value || '') });
  },

  onClearBindCode() {
    if (this.data.binding) return;
    this.setData({ bindCode: '' });
  },

  async onConfirmBind() {
    if (this.data.binding) return;
    const code = String(this.data.bindCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入设备标号', icon: 'none' });
      return;
    }
    this.setData({ binding: true });
    wx.showLoading({ title: '绑定中...', mask: true });
    try {
      await bindDeviceByCode(code);
      await syncMe().catch(() => {});
      await this.reload();
      const subscribeResult = await this.maybeRequestAlarmSubscribeAfterBind();
      this.setData({ bindPopupVisible: false, bindCode: '' });
      wx.hideLoading();
      wx.showToast({
        title: subscribeResult?.status === 'accepted' ? '绑定成功，已开启提醒' : '绑定成功',
        icon: 'success',
      });
    } catch (error: unknown) {
      wx.hideLoading();
      wx.showToast({
        title: getErrorMessage(error, '绑定失败'),
        icon: 'none',
        duration: 2500,
      });
    } finally {
      this.setData({ binding: false });
    }
  },

  async onRequestAlarmSubscribe() {
    if (this.data.alarmSubscribeLoading || this.data.alarmSubscribeButtonDisabled) return;
    this.setData({ alarmSubscribeLoading: true });
    try {
      const result = await requestAlarmSubscription();
      await this.refreshAlarmSubscribeCard();
      wx.showToast({
        title: result.status === 'accepted' ? '已开启告警提醒' : result.message || '授权未开启',
        icon: result.status === 'accepted' ? 'success' : 'none',
        duration: 2500,
      });
    } catch (error: unknown) {
      await this.refreshAlarmSubscribeCard();
      wx.showToast({
        title: getErrorMessage(error, '开启失败'),
        icon: 'none',
        duration: 2500,
      });
    } finally {
      this.setData({ alarmSubscribeLoading: false });
    }
  },

  async onSendAlarmSubscribeTest() {
    if (this.data.alarmSubscribeTestLoading || !this.data.alarmSubscribeTestVisible) return;
    this.setData({ alarmSubscribeTestLoading: true });
    try {
      const result = await sendAlarmSubscribeTest();
      wx.showToast({
        title: result.sent ? '测试提醒已发送' : result.message,
        icon: result.sent ? 'success' : 'none',
        duration: 2500,
      });
    } catch (error: unknown) {
      wx.showToast({
        title: getErrorMessage(error, '测试提醒发送失败'),
        icon: 'none',
        duration: 3000,
      });
    } finally {
      this.setData({ alarmSubscribeTestLoading: false });
    }
  },

  onSos() {
    showAppModal({
      title: '一键求助',
      content: '将向家庭成员推送求助告警，并同步生成求助工单和告警记录。是否继续？',
      confirmText: '求助',
      tone: 'warning',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await recordEmergencyHelp();
          wx.showToast({ title: '已发送求助', icon: 'success' });
        } catch (error: unknown) {
          wx.showToast({ title: getErrorMessage(error, '发送失败'), icon: 'none' });
        }
      },
    });
  },

  onOpenAlarmRecords() {
    wx.navigateTo({ url: '/pages/message/index?tab=DEVICE_ALARM' });
  },

  onOpenDevice(e: DeviceTapEvent) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/device-detail/index?id=${encodeURIComponent(id)}` });
  },

});

