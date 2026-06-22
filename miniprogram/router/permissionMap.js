import { canAccess } from '../utils/acl';
// 仅定义“需要权限”的页面；没写的默认允许访问
export const ROUTE_RULES = {
    '/pages/service/index': {
        // 业务要求：已登录用户无论权限如何都应能看到“设备 Tab”。
        // 因此页面级不做 ACL 拦截/重定向，交由设备页内部（按钮/模块级）控制。
        featureKey: '*',
        redirectTo: '/pages/home/index',
    },
    '/pages/device-detail/index': {
        featureKey: 'page.deviceDetail',
        redirectTo: '/pages/home/index',
    },
    '/pages/family-profile/index': {
        featureKey: 'page.familyProfile',
        redirectTo: '/pages/home/index',
    },
    '/pages/appointment/index': {
        featureKey: 'page.appointment',
        redirectTo: '/pages/home/index',
    },
    '/pages/message/index': {
        featureKey: 'page.message',
        redirectTo: '/pages/home/index',
    },
};
export function canAccessPath(role, path) {
    const rr = ROUTE_RULES[path];
    if (!rr)
        return { ok: true };
    return canAccess(role, rr.featureKey) ? { ok: true } : { ok: false, redirectTo: rr.redirectTo };
}
