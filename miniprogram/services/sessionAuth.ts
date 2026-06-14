import { getApiBaseUrl } from '../config/api';
import { USER_ROLES } from '../shared/roles';
import { roleStore } from '../store/roleStore';
import {
  clearAuth,
  ensureClientId,
  getRefreshToken,
  getRole,
  getToken,
  getTokenExpiresAt,
  setRefreshToken,
  setToken,
  setTokenExpiresAt,
} from '../utils/auth';
import { setDevOfflineFallback } from '../utils/devFallback';
import { createRequestTraceId } from '../utils/request';
import { isBackendUnreachable, markBackendUnreachable, markBackendReachable, isNetworkError } from '../utils/networkStatus';

type RefreshPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type RefreshBody = {
  code?: string | number;
  msg?: string;
  message?: string;
  data?: RefreshPayload;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

const EARLY_REFRESH_WINDOW_MS = 60_000;

let inflightRefresh: Promise<boolean> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnauthorizedCode(code: unknown): boolean {
  return code === 401 || code === 403 || code === '401' || code === '403'
      || code === 40002 || code === 40300;
}

function shouldRefresh(force: boolean): boolean {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (force) return true;

  const token = getToken();
  if (!token) return true;

  const expiresAt = getTokenExpiresAt();
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - EARLY_REFRESH_WINDOW_MS;
}

function buildRefreshError(message: string, code?: string | number) {
  const error = new Error(message) as Error & { code?: string | number };
  error.code = code;
  return error;
}

function extractPayload(body: RefreshBody, statusCode: number): RefreshPayload {
  if (typeof body.code === 'number' || typeof body.code === 'string') {
    if (body.code === 0 || body.code === '0') {
      return isRecord(body.data) ? (body.data as RefreshPayload) : {};
    }
    throw buildRefreshError(body.msg || body.message || '刷新登录态失败', body.code);
  }

  if (isRecord(body.data)) {
    return body.data as RefreshPayload;
  }

  if (statusCode >= 200 && statusCode < 300) {
    return body as RefreshPayload;
  }

  throw buildRefreshError(body.message || `刷新登录态失败 (HTTP ${statusCode})`, statusCode);
}

function requestRefresh(refreshToken: string): Promise<RefreshPayload> {
  // 熔断器：后端已知不可达，直接拒绝，不再浪费 15s 等待超时
  if (isBackendUnreachable()) {
    return Promise.reject(
      buildRefreshError('网络异常，后端服务暂时不可达', 'BACKEND_UNREACHABLE')
    );
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
          const body = isRecord(res.data) ? (res.data as RefreshBody) : {};
          resolve(extractPayload(body, res.statusCode));
        } catch (error) {
          reject(error);
        }
      },
      fail: (error) => {
        const errMsg = (error as WechatMiniprogram.GeneralCallbackResult)?.errMsg || '网络异常';
        if (isNetworkError(errMsg)) {
          markBackendUnreachable();
        }
        reject(buildRefreshError(errMsg, 'NETWORK'));
      },
    });
  });
}

export async function refreshSession(force = false): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Boolean(getToken());
  if (!shouldRefresh(force)) return Boolean(getToken());
  if (inflightRefresh) return inflightRefresh;

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
    } catch (error) {
      const code = (error as { code?: string | number } | null)?.code;
      if (isUnauthorizedCode(code)) {
        clearAuth();
        roleStore.setRole(USER_ROLES.VISITOR);
      }
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}