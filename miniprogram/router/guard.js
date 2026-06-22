import { roleStore } from '../store/roleStore';
import { canAccessPath } from './permissionMap';
import { getBoundPhone, getToken } from '../utils/auth';
import { promptLogin } from '../utils/loginGate';
const PUBLIC_PATHS = new Set([
    '/pages/home/index',
    '/pages/service-market/index',
    '/pages/mine/index',
    '/pages/appointment/index',
    '/pages/pro-assessment/index',
    '/pages/alt-phone-login/index',
    '/pages/safety-check/index',
    '/pages/family-invite/index',
    '/pages/service-detail/index',
    '/pages/suitable-products/index',
]);
const TAB_PATHS = new Set([
    '/pages/home/index',
    '/pages/service/index',
    '/pages/family-profile/index',
    '/pages/service-market/index',
    '/pages/mine/index',
]);
function normalizePath(urlOrPath) {
    const u = (urlOrPath || '').trim();
    if (!u)
        return '';
    const q = u.indexOf('?');
    return q >= 0 ? u.slice(0, q) : u;
}
function guardUrl(url) {
    const path = normalizePath(url);
    if (!path)
        return { ok: true };
    // 门禁：进入小程序必须先完成微信认证获取手机号
    // 本地判定：token + boundPhone（mock 阶段也遵循同一判定）
    const authed = Boolean(getToken()) && Boolean((getBoundPhone() || '').trim());
    if (!authed && !PUBLIC_PATHS.has(path)) {
        return { ok: false, redirectTo: '/pages/mine/index', reason: 'login' };
    }
    const { role } = roleStore.getState();
    const access = canAccessPath(role, path);
    if (access.ok) {
        return access;
    }
    return { ...access, reason: 'acl' };
}
function openGuardRedirect(redirectTo, preferredMode) {
    const path = normalizePath(redirectTo);
    if (!path) {
        return;
    }
    if (TAB_PATHS.has(path)) {
        wx.switchTab({ url: path });
        return;
    }
    if (preferredMode === 'reLaunch') {
        wx.reLaunch({ url: path });
        return;
    }
    wx.redirectTo({ url: path });
}
function handleBlockedNavigation(result, preferredMode) {
    if (result.reason === 'login') {
        promptLogin({
            content: '当前页面仅支持登录后访问，游客模式下可先浏览公开内容。',
        });
        return;
    }
    openGuardRedirect(result.redirectTo, preferredMode);
}
function wrapNav(original, getUrl, fallback) {
    return ((...args) => {
        const url = getUrl(args);
        if (url) {
            const r = guardUrl(url);
            if (!r.ok) {
                fallback(r);
                return;
            }
        }
        return original(...args);
    });
}
export function installRouterGuard() {
    const wxAny = wx;
    if (wxAny.__ab_guard_installed)
        return;
    wxAny.__ab_guard_installed = true;
    wx.navigateTo = wrapNav(wx.navigateTo, (args) => { var _a; return (_a = args === null || args === void 0 ? void 0 : args[0]) === null || _a === void 0 ? void 0 : _a.url; }, (result) => handleBlockedNavigation(result, 'redirectTo'));
    wx.redirectTo = wrapNav(wx.redirectTo, (args) => { var _a; return (_a = args === null || args === void 0 ? void 0 : args[0]) === null || _a === void 0 ? void 0 : _a.url; }, (result) => handleBlockedNavigation(result, 'redirectTo'));
    wx.reLaunch = wrapNav(wx.reLaunch, (args) => { var _a; return (_a = args === null || args === void 0 ? void 0 : args[0]) === null || _a === void 0 ? void 0 : _a.url; }, (result) => handleBlockedNavigation(result, 'reLaunch'));
    wx.switchTab = wrapNav(wx.switchTab, (args) => { var _a; return (_a = args === null || args === void 0 ? void 0 : args[0]) === null || _a === void 0 ? void 0 : _a.url; }, (result) => handleBlockedNavigation(result, 'switchTab'));
}
