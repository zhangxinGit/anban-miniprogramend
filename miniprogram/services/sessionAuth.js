import { getApiBaseUrl } from '../config/api';
import { USER_ROLES } from '../shared/roles';
import { roleStore } from '../store/roleStore';
import { clearAuth, ensureClientId, getRefreshToken, getRole, getToken, getTokenExpiresAt, setRefreshToken, setToken, setTokenExpiresAt, } from '../utils/auth';
import { setDevOfflineFallback } from '../utils/devFallback';
import { createRequestTraceId } from '../utils/request';
import { isBackendUnreachable, markBackendUnreachable, markBackendReachable, isNetworkError } from '../utils/networkStatus';
const EARLY_REFRESH_WINDOW_MS = 60000;
let inflightRefresh = null;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function isUnauthorizedCode(code) {
    return code === 401 || code === 403 || code === '401' || code === '403'
        || code === 40002 || code === 40300;
}
function shouldRefresh(force) {
    const refreshToken = getRefreshToken();
    if (!refreshToken)
        return false;
    if (force)
        return true;
    const token = getToken();
    if (!token)
        return true;
    const expiresAt = getTokenExpiresAt();
    if (!expiresAt)
        return false;
    return Date.now() >= expiresAt - EARLY_REFRESH_WINDOW_MS;
}
function buildRefreshError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}
function extractPayload(body, statusCode) {
    if (typeof body.code === 'number' || typeof body.code === 'string') {
        if (body.code === 0 || body.code === '0') {
            return isRecord(body.data) ? body.data : {};
        }
        throw buildRefreshError(body.msg || body.message || '刷新登录态失败', body.code);
    }
    if (isRecord(body.data)) {
        return body.data;
    }
    if (statusCode >= 200 && statusCode < 300) {
        return body;
    }
    throw buildRefreshError(body.message || `刷新登录态失败 (HTTP ${statusCode})`, statusCode);
}
function requestRefresh(refreshToken) {
    // 熔断器：后端已知不可达，直接拒绝，不再浪费 15s 等待超时
    if (isBackendUnreachable()) {
        return Promise.reject(buildRefreshError('网络异常，后端服务暂时不可达', 'BACKEND_UNREACHABLE'));
    }
    return new Promise((resolve, reject) => {
        wx.request({
            url: `${getApiBaseUrl()}/api/app/auth/refresh`,
            method: 'POST',
            data: { refresh_token: refreshToken },
            timeout: 15000,
            header: {
                'Content-Type': 'application/json',
                'X-Client-Id': ensureClientId(),
                'X-User-Role': getRole(),
                'X-Debug-Trace-Id': createRequestTraceId('mp-refresh'),
            },
            success: (res) => {
                markBackendReachable();
                try {
                    const body = isRecord(res.data) ? res.data : {};
                    resolve(extractPayload(body, res.statusCode));
                }
                catch (error) {
                    reject(error);
                }
            },
            fail: (error) => {
                const errMsg = (error === null || error === void 0 ? void 0 : error.errMsg) || '网络异常';
                if (isNetworkError(errMsg)) {
                    markBackendUnreachable();
                }
                reject(buildRefreshError(errMsg, 'NETWORK'));
            },
        });
    });
}
export async function refreshSession(force = false) {
    const refreshToken = getRefreshToken();
    if (!refreshToken)
        return Boolean(getToken());
    if (!shouldRefresh(force))
        return Boolean(getToken());
    if (inflightRefresh)
        return inflightRefresh;
    inflightRefresh = (async () => {
        try {
            const payload = await requestRefresh(refreshToken);
            const nextAccessToken = String(payload.access_token || '').trim();
            if (!nextAccessToken) {
                throw buildRefreshError('刷新登录态失败：缺少 access_token');
            }
            const nextRefreshToken = String(payload.refresh_token || refreshToken).trim() || refreshToken;
            const expiresIn = Number(payload.expires_in) || 0;
            setToken(nextAccessToken);
            setRefreshToken(nextRefreshToken);
            setTokenExpiresAt(expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);
            setDevOfflineFallback(false);
            return true;
        }
        catch (error) {
            const code = error === null || error === void 0 ? void 0 : error.code;
            if (isUnauthorizedCode(code)) {
                clearAuth();
                roleStore.setRole(USER_ROLES.VISITOR);
            }
            return false;
        }
        finally {
            inflightRefresh = null;
        }
    })();
    return inflightRefresh;
}
