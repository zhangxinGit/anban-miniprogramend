import { request } from '../utils/request';
import { normalizeToAppRole, USER_ROLES } from '../shared/roles';
import { roleStore } from '../store/roleStore';
import { getRefreshToken, getToken, setUserId } from '../utils/auth';
import { FORCE_MOCK } from '../config/mock';
import { setDevOfflineFallback } from '../utils/devFallback';
import { clearStaffSession } from '../utils/staffAuth';
import { refreshSession } from './sessionAuth';
import { getApiBaseUrl } from '../config/api';
function getLoggedInFallbackRole() {
    const current = roleStore.getState().role;
    return current === USER_ROLES.VISITOR ? USER_ROLES.LEAD : current;
}
function isUnauthorizedCode(code) {
    return code === 401 || code === 403 || code === '401' || code === '403'
        || code === 40002 || code === 40300;
}
async function requestMe() {
    return request({
        url: '/api/app/me',
        method: 'GET',
    });
}
export async function syncMe() {
    if (FORCE_MOCK) {
        const cur = roleStore.getState().role || USER_ROLES.VISITOR;
        roleStore.setRole(cur);
        return { role: cur };
    }
    // 未登录（无 token）时直接跳过 API 调用，避免阻塞页面加载
    if (!getToken()) {
        roleStore.setRole(USER_ROLES.VISITOR);
        clearStaffSession();
        return { role: USER_ROLES.VISITOR };
    }
    await refreshSession(false);
    let resp = await requestMe();
    if (!resp.ok && isUnauthorizedCode(resp.code)) {
        // token 可能刚刚下发但尚未完全生效，进行强制刷新后重试
        const refreshed = await refreshSession(true);
        if (refreshed) {
            resp = await requestMe();
        }
    }
    // 如果 /me 仍然失败但不是 401/403（如网络错误），保留当前 token/role 不变
    if (!resp.ok) {
        const shouldResetToVisitor = isUnauthorizedCode(resp.code) && !getToken() && !getRefreshToken();
        const fallback = shouldResetToVisitor ? USER_ROLES.VISITOR : getLoggedInFallbackRole();
        if (fallback === USER_ROLES.VISITOR) {
            clearStaffSession();
        }
        roleStore.setRole(fallback);
        return { role: fallback };
    }
    const data = resp.data;
    if (!(data === null || data === void 0 ? void 0 : data.is_logged_in)) {
        clearStaffSession();
        roleStore.setRole(USER_ROLES.VISITOR);
        return { role: USER_ROLES.VISITOR };
    }
    let next;
    if (typeof data.role === 'string' && data.role.trim()) {
        next = normalizeToAppRole(data.role);
    }
    else if (typeof data.is_customer === 'boolean') {
        next = data.is_customer ? USER_ROLES.CUSTOMER : USER_ROLES.LEAD;
    }
    else {
        next = USER_ROLES.LEAD;
    }
    roleStore.setRole(next);
    setDevOfflineFallback(false);
    if (data.user_id) {
        setUserId(String(data.user_id));
    }
    return {
        role: next,
        nickName: typeof data.nick_name === 'string' ? data.nick_name : undefined,
        avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
    };
}
/**
 * 上传用户头像文件到后端，返回永久 URL。
 * 使用 wx.uploadFile（二进制 multipart），需在小程序后台配置 uploadFile 合法域名。
 */
export async function uploadAvatar(filePath) {
    const token = getToken();
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/app/me/avatar`;
    const header = {};
    if (token) {
        header.Authorization = `Bearer ${token}`;
    }
    return await new Promise((resolve, reject) => {
        wx.uploadFile({
            url,
            filePath,
            name: 'file',
            header,
            success: (res) => {
                var _a, _b;
                try {
                    const body = JSON.parse(res.data);
                    console.log('[uploadAvatar] response:', JSON.stringify(body));
                    // 兼容 ApiResponse: { code: 0, data: { avatar_url } }
                    if (body.code === 0 && ((_a = body.data) === null || _a === void 0 ? void 0 : _a.avatar_url)) {
                        resolve(body.data.avatar_url);
                        return;
                    }
                    // 兼容 { ok: true, data: { avatar_url } }
                    if (body.ok === true && ((_b = body.data) === null || _b === void 0 ? void 0 : _b.avatar_url)) {
                        resolve(body.data.avatar_url);
                        return;
                    }
                    const msg = body.msg || body.message || '头像上传失败';
                    const detail = `(${res.statusCode}) ${msg}`;
                    reject(new Error(detail));
                }
                catch (e) {
                    console.error('[uploadAvatar] parse error:', res.data);
                    reject(new Error(`响应解析失败 (HTTP ${res.statusCode}): ${String(res.data).slice(0, 200)}`));
                }
            },
            fail: (err) => {
                console.error('[uploadAvatar] request fail:', err);
                reject(new Error(err.errMsg || '头像上传网络请求失败'));
            },
        });
    });
}
export async function updateMeProfile(payload) {
    const nickName = typeof payload.nickName === 'string' ? payload.nickName.trim() : '';
    const avatarUrl = typeof payload.avatarUrl === 'string' ? payload.avatarUrl.trim() : '';
    if (!nickName && !avatarUrl) {
        return;
    }
    const resp = await request({
        url: '/api/app/me/profile',
        method: 'POST',
        data: {
            nick_name: nickName,
            avatar_url: avatarUrl,
        },
    });
    if (!resp.ok) {
        throw new Error(resp.message || '更新用户资料失败');
    }
}
