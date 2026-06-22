import { exchangeStaffSessionFromApp } from '../services/staffAuth';
import { USER_ROLES, isManagementRole } from '../shared/roles';
import { roleStore } from '../store/roleStore';
import { getToken } from './auth';
const STORAGE_KEYS = {
    token: 'ab_staff_token',
    adminId: 'ab_staff_admin_id',
    role: 'ab_staff_role',
    username: 'ab_staff_username',
    name: 'ab_staff_name',
};
export function getStaffToken() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.token);
        return typeof value === 'string' && value ? value : null;
    }
    catch {
        return null;
    }
}
export function getStaffAdminId() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.adminId);
        const next = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(next) && next > 0 ? next : null;
    }
    catch {
        return null;
    }
}
export function getStaffRole() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.role);
        return typeof value === 'string' && value ? value : null;
    }
    catch {
        return null;
    }
}
export function getStaffUsername() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.username);
        return typeof value === 'string' && value ? value : null;
    }
    catch {
        return null;
    }
}
export function getStaffName() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.name);
        return typeof value === 'string' && value ? value : null;
    }
    catch {
        return null;
    }
}
export function getStaffAuthState() {
    return {
        token: getStaffToken(),
        adminId: getStaffAdminId(),
        role: getStaffRole(),
        username: getStaffUsername(),
        name: getStaffName(),
    };
}
export function setStaffSession(input) {
    try {
        wx.setStorageSync(STORAGE_KEYS.token, input.token);
        wx.setStorageSync(STORAGE_KEYS.adminId, input.adminId);
        wx.setStorageSync(STORAGE_KEYS.role, input.role);
        if (input.username)
            wx.setStorageSync(STORAGE_KEYS.username, input.username);
        else
            wx.removeStorageSync(STORAGE_KEYS.username);
        if (input.name)
            wx.setStorageSync(STORAGE_KEYS.name, input.name);
        else
            wx.removeStorageSync(STORAGE_KEYS.name);
    }
    catch {
        return;
    }
}
export function clearStaffSession() {
    try {
        wx.removeStorageSync(STORAGE_KEYS.token);
        wx.removeStorageSync(STORAGE_KEYS.adminId);
        wx.removeStorageSync(STORAGE_KEYS.role);
        wx.removeStorageSync(STORAGE_KEYS.username);
        wx.removeStorageSync(STORAGE_KEYS.name);
    }
    catch {
        return;
    }
}
export function hasStaffSession() {
    return Boolean(getStaffToken() && getStaffAdminId());
}
export function staffRoleLabel(role) {
    if (role === 'admin')
        return '管理角色';
    if (role === 'operator')
        return '运营角色';
    return '工作人员';
}
export function openStaffLogin(redirectUrl) {
    const nextUrl = redirectUrl ? `/pages/staff-login/index?redirect=${encodeURIComponent(redirectUrl)}` : '/pages/staff-login/index';
    wx.navigateTo({ url: nextUrl });
}
let staffSessionPromise = null;
function redirectToMine(message) {
    if (message) {
        wx.showToast({ title: message, icon: 'none' });
    }
    const current = getCurrentPages().slice(-1)[0];
    if ((current === null || current === void 0 ? void 0 : current.route) === 'pages/mine/index') {
        return;
    }
    wx.switchTab({ url: '/pages/mine/index' });
}
export async function ensureStaffSession(_redirectUrl) {
    if (hasStaffSession())
        return true;
    if (!getToken()) {
        clearStaffSession();
        redirectToMine('请先登录小程序账号');
        return false;
    }
    const role = roleStore.getState().role;
    if (!isManagementRole(role)) {
        clearStaffSession();
        redirectToMine('当前账号不是管理人员');
        return false;
    }
    if (!staffSessionPromise) {
        staffSessionPromise = exchangeStaffSessionFromApp()
            .then(() => true)
            .catch((error) => {
            clearStaffSession();
            const message = error instanceof Error ? error.message : '工作台暂不可用';
            redirectToMine(message || '工作台暂不可用');
            return false;
        })
            .finally(() => {
            staffSessionPromise = null;
        });
    }
    return staffSessionPromise;
}
export function isStaffWorkbenchRole(role) {
    return role === USER_ROLES.OPERATOR || role === USER_ROLES.ADMIN;
}
