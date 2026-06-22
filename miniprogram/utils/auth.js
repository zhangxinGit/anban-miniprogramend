import { migrateStoredRole, USER_ROLES } from '../shared/roles';
import { getEnvVersion } from '../utils/env';
/**
 * 存储 Key 环境后缀。
 * - release（正式版）不加后缀，保持兼容线上已登录用户
 * - develop / trial 加后缀，避免同一手机上测试环境 token 覆盖正式环境 token
 */
const ENV_SUFFIX = (() => {
    try {
        const v = getEnvVersion();
        return v === 'release' ? '' : `_${v}`;
    }
    catch {
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
};
export function getRefreshToken() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.refreshToken);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function setRefreshToken(token) {
    try {
        if (!token)
            wx.removeStorageSync(STORAGE_KEYS.refreshToken);
        else
            wx.setStorageSync(STORAGE_KEYS.refreshToken, token);
    }
    catch {
        // ignore
    }
}
export function getTokenExpiresAt() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.tokenExpiresAt);
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    catch {
        return null;
    }
}
export function setTokenExpiresAt(ts) {
    try {
        if (!ts)
            wx.removeStorageSync(STORAGE_KEYS.tokenExpiresAt);
        else
            wx.setStorageSync(STORAGE_KEYS.tokenExpiresAt, ts);
    }
    catch {
        // ignore
    }
}
export function getClientId() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.clientId);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function ensureClientId() {
    const cur = getClientId();
    if (cur)
        return cur;
    const v = `ab_c_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    try {
        wx.setStorageSync(STORAGE_KEYS.clientId, v);
    }
    catch {
        // ignore
    }
    return v;
}
export function getToken() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.token);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function setToken(token) {
    try {
        if (!token)
            wx.removeStorageSync(STORAGE_KEYS.token);
        else
            wx.setStorageSync(STORAGE_KEYS.token, token);
    }
    catch {
        // ignore
    }
}
export function getRole() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.role);
        return migrateStoredRole(v);
    }
    catch {
        return USER_ROLES.VISITOR;
    }
}
export function setRole(role) {
    try {
        wx.setStorageSync(STORAGE_KEYS.role, role);
    }
    catch {
        // ignore
    }
}
export function getBoundPhone() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.boundPhone);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function setBoundPhone(phone) {
    try {
        if (!phone)
            wx.removeStorageSync(STORAGE_KEYS.boundPhone);
        else
            wx.setStorageSync(STORAGE_KEYS.boundPhone, phone);
    }
    catch {
        // ignore
    }
}
export function getAuthState() {
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
export function isLoggedIn() {
    return Boolean(getToken());
}
export function getUserId() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.userId);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function setUserId(userId) {
    try {
        if (!userId)
            wx.removeStorageSync(STORAGE_KEYS.userId);
        else
            wx.setStorageSync(STORAGE_KEYS.userId, userId);
    }
    catch {
        // ignore
    }
}
export function getLeadId() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.leadId);
        return typeof v === 'string' && v ? v : null;
    }
    catch {
        return null;
    }
}
export function setLeadId(leadId) {
    try {
        if (!leadId)
            wx.removeStorageSync(STORAGE_KEYS.leadId);
        else
            wx.setStorageSync(STORAGE_KEYS.leadId, leadId);
    }
    catch {
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
    }
    catch {
        // ignore
    }
}
