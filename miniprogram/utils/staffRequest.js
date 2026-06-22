import { getApiBaseUrl } from '../config/api';
import { getStaffAuthState } from './staffAuth';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function resolveUrl(input) {
    const baseUrl = getApiBaseUrl();
    if (/^https?:\/\//.test(input))
        return input;
    if (input.startsWith('/'))
        return `${baseUrl}${input}`;
    return `${baseUrl}/${input}`;
}
export async function staffRequest(options) {
    const state = getStaffAuthState();
    const authRequired = options.auth !== false;
    const header = {
        'content-type': 'application/json',
        ...options.header,
    };
    if (authRequired) {
        if (!state.token || !state.adminId) {
            return { ok: false, message: '请先登录工作人员账号' };
        }
        header.Authorization = `Bearer ${state.token}`;
        header['X-Admin-UserId'] = String(state.adminId);
        if (state.role)
            header['X-Admin-Role'] = state.role;
        if (state.username)
            header['X-Admin-Username'] = state.username;
    }
    return await new Promise((resolve) => {
        wx.request({
            ...options,
            url: resolveUrl(String(options.url || '')),
            header,
            success: (res) => {
                const body = isRecord(res.data) ? res.data : {};
                if (typeof body.code === 'number') {
                    if (body.code === 0) {
                        resolve({ ok: true, data: body.data });
                        return;
                    }
                    resolve({
                        ok: false,
                        message: typeof body.msg === 'string' && body.msg ? body.msg : '请求失败',
                        code: typeof body.code === 'number' ? body.code : undefined,
                    });
                    return;
                }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ ok: true, data: body });
                    return;
                }
                resolve({ ok: false, message: `HTTP ${res.statusCode}` });
            },
            fail: (error) => {
                const message = isRecord(error) && typeof error.errMsg === 'string' ? error.errMsg : '网络异常';
                resolve({ ok: false, message });
            },
        });
    });
}
