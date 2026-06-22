import { createRequestTraceId, request } from '../utils/request';
import { getToken, setBoundPhone, setRefreshToken, setToken, setTokenExpiresAt, setUserId } from '../utils/auth';
import { setDevOfflineFallback } from '../utils/devFallback';
import { syncMe } from './appMe';
export async function loginWithWeChat(payload) {
    const traceId = createRequestTraceId('wechat-login');
    const phoneCode = (payload.phoneCode || '').trim();
    const encryptedData = (payload.encryptedData || '').trim();
    const iv = (payload.iv || '').trim();
    if (!phoneCode && !(encryptedData && iv)) {
        throw new Error('未获取到手机号授权凭证 [stage:phone.auth]');
    }
    const wxLogin = await new Promise((resolve, reject) => {
        wx.login({
            success: (res) => {
                if (res.code)
                    resolve({ code: res.code });
                else
                    reject(new Error('微信登录失败，请重试 [stage:wx.login]'));
            },
            fail: () => reject(new Error('微信登录失败，请重试 [stage:wx.login]')),
        });
    });
    const resp = await request({
        url: '/api/app/auth/wechat/login',
        method: 'POST',
        header: {
            'X-Debug-Trace-Id': traceId,
        },
        data: {
            code: wxLogin.code,
            phoneCode,
            encryptedData,
            iv,
            nickName: payload.nickName || '',
            avatarUrl: payload.avatarUrl || '',
        },
    });
    if (!resp.ok)
        throw new Error(`${resp.message || '微信登录失败'} [stage:auth.request] [trace:${traceId}]`);
    setUserId(String(resp.data.user_id));
    setToken(resp.data.access_token);
    setRefreshToken(resp.data.refresh_token);
    const expiresIn = Number(resp.data.expires_in) || 0;
    setTokenExpiresAt(expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);
    if (resp.data.phone) {
        setBoundPhone(String(resp.data.phone));
    }
    setDevOfflineFallback(false);
    // 同步角色与用户信息，若 syncMe 因 401 清理了 token，则登录未完全成功
    const meResult = await syncMe().catch(() => null);
    const tokenAfterSync = getToken();
    if (!tokenAfterSync) {
        // token 已被 clearAuth 清空（refreshSession 发现 refresh_token 也无效）
        if (meResult === null || meResult === void 0 ? void 0 : meResult.role) {
            throw new Error(`登录态同步失败：角色已重置为 ${meResult.role}，请重新授权 [stage:sync.me] [trace:${traceId}]`);
        }
        throw new Error(`登录态同步失败，请重新授权 [stage:sync.me] [trace:${traceId}]`);
    }
}
