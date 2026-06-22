import { migrateStoredRole, USER_ROLES, type UserRole } from '../shared/roles';
import { type MiniProgramEnvVersion, getEnvVersion } from '../utils/env';

/**
 * 存储 Key 环境后缀。
 * - release（正式版）不加后缀，保持兼容线上已登录用户
 * - develop / trial 加后缀，避免同一手机上测试环境 token 覆盖正式环境 token
 */
const ENV_SUFFIX: string = (() => {
  try {
    const v: MiniProgramEnvVersion = getEnvVersion();
    return v === 'release' ? '' : `_${v}`;
  } catch {
    return '';
  }
})();

const STORAGE_KEYS = {
  token: `ab${ENV_SUFFIX}_token`,
  refreshToken: `ab${ENV_SUFFIX}_refresh_token`,
  tokenExpiresAt: `ab${ENV_SUFFIX}_token_expires_at`,
  role: `ab${ENV_SUFFIX}_role`,
  userId: `ab${ENV_SUFFIX}_user_id`,
  leadId: `ab${ENV_SUFFIX}_lead_id`,
  boundPhone: `ab${ENV_SUFFIX}_bound_phone`,
  clientId: `ab${ENV_SUFFIX}_client_id`,
} as const;

export type AuthState = {
  token: string | null;
  refreshToken: string | null;
  /** access_token 过期时间戳(ms)，用于前端提示/预刷新（不作为鉴权依据） */
  tokenExpiresAt: number | null;
  role: UserRole;
  userId: string | null;
  leadId: string | null;
  /** 当前登录绑定的手机号 */
  boundPhone: string | null;
  /** 设备匿名ID，用于游客态数据归因 */
  clientId: string | null;
};

export function getRefreshToken(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.refreshToken);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function setRefreshToken(token: string | null) {
  try {
    if (!token) wx.removeStorageSync(STORAGE_KEYS.refreshToken);
    else wx.setStorageSync(STORAGE_KEYS.refreshToken, token);
  } catch {
    // ignore
  }
}

export function getTokenExpiresAt(): number | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.tokenExpiresAt);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setTokenExpiresAt(ts: number | null) {
  try {
    if (!ts) wx.removeStorageSync(STORAGE_KEYS.tokenExpiresAt);
    else wx.setStorageSync(STORAGE_KEYS.tokenExpiresAt, ts);
  } catch {
    // ignore
  }
}

export function getClientId(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.clientId);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function ensureClientId(): string {
  const cur = getClientId();
  if (cur) return cur;
  const v = `ab_c_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  try {
    wx.setStorageSync(STORAGE_KEYS.clientId, v);
  } catch {
    // ignore
  }
  return v;
}

export function getToken(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.token);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (!token) wx.removeStorageSync(STORAGE_KEYS.token);
    else wx.setStorageSync(STORAGE_KEYS.token, token);
  } catch {
    // ignore
  }
}

export function getRole(): UserRole {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.role);
    return migrateStoredRole(v);
  } catch {
    return USER_ROLES.VISITOR;
  }
}

export function setRole(role: UserRole) {
  try {
    wx.setStorageSync(STORAGE_KEYS.role, role);
  } catch {
    // ignore
  }
}

export function getBoundPhone(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.boundPhone);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function setBoundPhone(phone: string | null) {
  try {
    if (!phone) wx.removeStorageSync(STORAGE_KEYS.boundPhone);
    else wx.setStorageSync(STORAGE_KEYS.boundPhone, phone);
  } catch {
    // ignore
  }
}

export function getAuthState(): AuthState {
  return {
    token: getToken(),
    refreshToken: getRefreshToken(),
    tokenExpiresAt: getTokenExpiresAt(),
    role: getRole(),
    userId: getUserId(),
    leadId: getLeadId(),
    boundPhone: getBoundPhone(),
    clientId: getClientId(),
  };
}

/** 已登录：存在有效 token（联调/正式登录后使用；演示环境可能未写入 token） */
export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function getUserId(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.userId);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function setUserId(userId: string | null) {
  try {
    if (!userId) wx.removeStorageSync(STORAGE_KEYS.userId);
    else wx.setStorageSync(STORAGE_KEYS.userId, userId);
  } catch {
    // ignore
  }
}

export function getLeadId(): string | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.leadId);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}

export function setLeadId(leadId: string | null) {
  try {
    if (!leadId) wx.removeStorageSync(STORAGE_KEYS.leadId);
    else wx.setStorageSync(STORAGE_KEYS.leadId, leadId);
  } catch {
    // ignore
  }
}

export function clearAuth() {
  setToken(null);
  setRefreshToken(null);
  setTokenExpiresAt(null);
  setBoundPhone(null);
  try {
    wx.removeStorageSync(STORAGE_KEYS.role);
    wx.removeStorageSync(STORAGE_KEYS.userId);
    wx.removeStorageSync(STORAGE_KEYS.leadId);
  } catch {
    // ignore
  }
}
