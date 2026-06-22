/**
 * C 端小程序用户角色：
 * - VISITOR：游客
 * - LEAD：已登录但未进入设备闭环的普通用户
 * - CUSTOMER：已成交用户
 * - OPERATOR / ADMIN：后台已开通的管理人员，会在“我的”页显示工作台入口
 */
export const USER_ROLES = {
    VISITOR: 'VISITOR',
    LEAD: 'LEAD',
    CUSTOMER: 'CUSTOMER',
    OPERATOR: 'OPERATOR',
    ADMIN: 'ADMIN',
};
export const ROLE_ORDER = [
    USER_ROLES.VISITOR,
    USER_ROLES.LEAD,
    USER_ROLES.CUSTOMER,
    USER_ROLES.OPERATOR,
    USER_ROLES.ADMIN,
];
const LEAD_ROLES = new Set([
    USER_ROLES.LEAD,
    'lead',
    'LEAD',
    'DEAL_NO_DEVICE',
    'deal_no_device',
]);
const DEVICE_READY_ROLES = new Set([
    'DEAL_NO_DEVICE',
    'FAMILY_MEMBER',
    'family_member',
    'DEVICE_ADMIN',
    'device_admin',
    'OWNER',
    'owner',
    USER_ROLES.CUSTOMER,
    'customer',
]);
const OPERATOR_ROLES = new Set([
    USER_ROLES.OPERATOR,
    'operator',
    'OPERATOR',
    'staff',
    'STAFF',
]);
const ADMIN_ROLES = new Set([
    USER_ROLES.ADMIN,
    'admin',
    'ADMIN',
    'administrator',
    'ADMINISTRATOR',
    'super_admin',
    'SUPER_ADMIN',
]);
export function isUserRole(role) {
    return role === USER_ROLES.VISITOR
        || role === USER_ROLES.LEAD
        || role === USER_ROLES.CUSTOMER
        || role === USER_ROLES.OPERATOR
        || role === USER_ROLES.ADMIN;
}
export function isManagementRole(role) {
    return role === USER_ROLES.OPERATOR || role === USER_ROLES.ADMIN;
}
export function managementRoleLabel(role) {
    if (role === USER_ROLES.ADMIN || role === 'admin')
        return '管理人员';
    if (role === USER_ROLES.OPERATOR || role === 'operator' || role === 'staff')
        return '运营人员';
    return '管理人员';
}
/** 本地缓存中的旧角色串迁到当前二态模型 */
export function migrateStoredRole(raw) {
    if (raw === USER_ROLES.VISITOR || raw === 'visitor')
        return USER_ROLES.VISITOR;
    if (raw === USER_ROLES.LEAD || LEAD_ROLES.has(String(raw)))
        return USER_ROLES.LEAD;
    if (raw === USER_ROLES.CUSTOMER || DEVICE_READY_ROLES.has(String(raw)))
        return USER_ROLES.CUSTOMER;
    if (OPERATOR_ROLES.has(String(raw)))
        return USER_ROLES.OPERATOR;
    if (ADMIN_ROLES.has(String(raw)))
        return USER_ROLES.ADMIN;
    return USER_ROLES.VISITOR;
}
/**
 * 将后端或接口返回的 role 字符串转为前端角色。
 */
export function normalizeToAppRole(raw) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    const lower = s.toLowerCase();
    if (lower === 'visitor' || s === USER_ROLES.VISITOR)
        return USER_ROLES.VISITOR;
    if (lower === 'lead' || LEAD_ROLES.has(s) || LEAD_ROLES.has(lower)) {
        return USER_ROLES.LEAD;
    }
    if (lower === 'customer' || DEVICE_READY_ROLES.has(s) || DEVICE_READY_ROLES.has(lower)) {
        return USER_ROLES.CUSTOMER;
    }
    if (OPERATOR_ROLES.has(s) || OPERATOR_ROLES.has(lower))
        return USER_ROLES.OPERATOR;
    if (ADMIN_ROLES.has(s) || ADMIN_ROLES.has(lower))
        return USER_ROLES.ADMIN;
    return USER_ROLES.VISITOR;
}
