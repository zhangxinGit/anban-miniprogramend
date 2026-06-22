import { request } from '../utils/request';
import { setStaffSession } from '../utils/staffAuth';
import { staffRequest } from '../utils/staffRequest';
export async function loginStaffAccount(phone, password) {
    const normalizedPhone = (phone || '').trim();
    const normalizedPassword = (password || '').trim();
    if (normalizedPhone.length !== 11) {
        throw new Error('请输入11位手机号');
    }
    if (!normalizedPassword) {
        throw new Error('请输入密码');
    }
    const resp = await staffRequest({
        url: '/api/admin/auth/login',
        method: 'POST',
        auth: false,
        data: { username: normalizedPhone, password: normalizedPassword },
    });
    if (!resp.ok) {
        throw new Error(resp.message || '登录失败');
    }
    setStaffSession({
        token: resp.data.token,
        adminId: resp.data.admin_id,
        role: resp.data.role,
        username: resp.data.username || normalizedPhone,
        name: resp.data.name || '',
    });
    return resp.data;
}
export async function exchangeStaffSessionFromApp() {
    const resp = await request({
        url: '/api/app/auth/staff-session',
        method: 'POST',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '当前账号未开通工作台');
    }
    setStaffSession({
        token: resp.data.token,
        adminId: resp.data.admin_id,
        role: resp.data.role,
        username: resp.data.username || '',
        name: resp.data.name || '',
    });
    return resp.data;
}
