import { getRole, setBoundPhone, setRefreshToken, setToken, setTokenExpiresAt, setUserId } from '../utils/auth';
import { roleStore } from '../store/roleStore';
import { normalizeToAppRole, USER_ROLES } from '../shared/roles';
import { request } from '../utils/request';
import { syncMe } from './appMe';
import { isDevOfflineFallback, setDevOfflineFallback } from '../utils/devFallback';
import { FORCE_MOCK } from '../config/mock';

const COOLDOWN_MS = 60_000;

function isValidCnMobile(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test((phone || '').trim());
}

const STORAGE = {
  cooldown: 'ab_sms_cd_', // + phone
} as const;

function getLoggedInFallbackRole() {
  return USER_ROLES.LEAD;
}

/**
 * 发送短信验证码（生产：后端对接短信网关；前端不落库验证码）。
 */
export async function sendVerificationCode(phone: string): Promise<void> {
  const p = (phone || '').trim();
  if (!isValidCnMobile(p)) {
    throw new Error('请输入11位有效手机号');
  }
  if (FORCE_MOCK || isDevOfflineFallback()) {
    // 离线兜底：不发请求，只模拟成功
    return;
  }
  const now = Date.now();
  const k = `${STORAGE.cooldown}${p}`;
  const last = Number(wx.getStorageSync(k)) || 0;
  if (now - last < COOLDOWN_MS) {
    const s = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    throw new Error(`请${s}秒后再获取`);
  }
  const resp = await request<{ ok: true }>({
    url: '/api/app/auth/sms/send',
    method: 'POST',
    data: { phone: p },
  });
  if (!resp.ok) {
    // 若后端不可用，允许开发离线兜底
    setDevOfflineFallback(true);
    throw new Error(resp.message || '发送失败，请稍后重试');
  }
  try {
    wx.setStorageSync(k, now);
  } catch {}
}

/**
 * 验证码登录。角色以后端 /me 与 role 字段为准，支持 LEAD/CUSTOMER 分流。
 */
export async function loginWithSmsCode(phone: string, code: string): Promise<{
  isNewUser: boolean;
  token: string;
  userId: string;
}> {
  const p = (phone || '').trim();
  const c = (code || '').trim();
  if (!isValidCnMobile(p)) {
    throw new Error('请输入11位有效手机号');
  }
  if (!/^\d{6}$/.test(c)) {
    throw new Error('请输入6位数字验证码');
  }
  if (getRole() !== USER_ROLES.VISITOR) {
    throw new Error('当前已登录，请先退出再操作');
  }

  if (FORCE_MOCK || isDevOfflineFallback()) {
    // 离线兜底：验证码固定 123456
    if (c !== '123456') throw new Error('验证码错误（离线模式请填 123456）');
    const token = `mock_sms_${Date.now()}`;
    const userId = `mock_u_${p}`;
    setUserId(userId);
    setToken(token);
    setRefreshToken(token);
    setTokenExpiresAt(Date.now() + 24 * 60 * 60 * 1000);
    setBoundPhone(p);
    roleStore.setRole(getLoggedInFallbackRole());
    await syncMe().catch(() => {});
    return { isNewUser: false, token, userId };
  }

  const resp = await request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
    phone: string;
    role?: string;
  }>({
    url: '/api/app/auth/sms/login',
    method: 'POST',
    data: { phone: p, code: c },
  });
  if (!resp.ok) {
    // 若后端不可用，允许开发离线兜底
    setDevOfflineFallback(true);
    throw new Error(resp.message || '登录失败');
  }

  const token = resp.data.access_token;
  const refreshToken = resp.data.refresh_token;
  const expiresIn = Number(resp.data.expires_in) || 0;
  const userId = String(resp.data.user_id);
  setUserId(userId);
  setToken(token);
  setRefreshToken(refreshToken);
  setTokenExpiresAt(expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);
  setBoundPhone(p);
  setDevOfflineFallback(false);
  // 以服务端 role 为准；兜底由 syncMe 再次校正。
  roleStore.setRole(
    typeof resp.data.role === 'string' && resp.data.role.trim()
      ? normalizeToAppRole(resp.data.role)
      : getLoggedInFallbackRole(),
  );
  // 再拉一次 /me，确保角色与 user_id 完全以服务端为准
  await syncMe().catch(() => {});

  // 后端目前不返回 isNewUser；小程序端视为“登录成功”
  return { isNewUser: false, token, userId };
}
