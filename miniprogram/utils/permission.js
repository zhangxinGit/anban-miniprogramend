import { ROLE_ORDER, USER_ROLES } from '../shared/roles';
function roleRank(role) {
    const idx = ROLE_ORDER.indexOf(role);
    return idx === -1 ? 0 : idx;
}
export function hasAccess(role, rule) {
    if ('anyOf' in rule)
        return rule.anyOf.includes(role);
    return roleRank(role) >= roleRank(rule.minRole);
}
export function isDealed(role) {
    return role === USER_ROLES.CUSTOMER
        || role === USER_ROLES.OPERATOR
        || role === USER_ROLES.ADMIN;
}
export function tabCountByRole(role) {
    void role;
    return 3;
}
/**
 * 给页面 data 用：无权限 = 不渲染（wx:if="{{visible.xxx}}"）
 */
export function buildVisibilityMap(role, rules) {
    const out = {};
    Object.keys(rules).forEach((k) => {
        out[k] = hasAccess(role, rules[k]);
    });
    return out;
}
