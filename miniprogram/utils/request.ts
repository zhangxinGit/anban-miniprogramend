import { ensureClientId, getAuthState } from './auth';
import { normalizeToAppRole, type UserRole } from '../shared/roles';
import { roleStore } from '../store/roleStore';
import { getApiBaseUrl, normalizeAppApiPath } from '../config/api';
import { isBackendUnreachable, markBackendUnreachable, markBackendReachable, isNetworkError } from './networkStatus';

export type ApiOk<T> = {
  ok: true;
  data: T;
  role: UserRole;
};

export type ApiErr = {
  ok: false;
  message: string;
  code?: string | number;
  role?: UserRole;
};

export type ApiResp<T> = ApiOk<T> | ApiErr;

type RequestOptions = Omit<WechatMiniprogram.RequestOption, 'success' | 'fail'> & {
  /** 跳过熔断器检查，适用于无需鉴权的公开接口（如 banner/kingkong/service-catalog） */
  skipBreaker?: boolean;
};
type RequestHeaderValue = string | number | boolean;
type RequestHeader = Record<string, RequestHeaderValue>;
type ResponseBody = Record<string, unknown>;

const TRACE_ID_KEY = 'ab_last_trace_id';

export function createRequestTraceId(prefix = 'mp'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getLastRequestTraceId(): string {
  try {
    const value = wx.getStorageSync(TRACE_ID_KEY);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function saveLastRequestTraceId(traceId: string) {
  try {
    wx.setStorageSync(TRACE_ID_KEY, traceId);
  } catch {
    return;
  }
}

function isRecord(value: unknown): value is ResponseBody {
  return typeof value === 'object' && value !== null;
}

function getStringField(value: ResponseBody, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}

function getRecordField(value: ResponseBody, key: string): ResponseBody | undefined {
  const field = value[key];
  return isRecord(field) ? field : undefined;
}

function getErrorCode(value: ResponseBody, fallback?: string | number): string | number | undefined {
  const code = value.code;
  if (typeof code === 'string' || typeof code === 'number') {
    return code;
  }
  return fallback;
}

function getRequestHeader(input: RequestOptions['header']): RequestHeader {
  if (!input || typeof input !== 'object') return {};
  const header: RequestHeader = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      header[key] = value;
    }
  }
  return header;
}

function normalizeError(e: unknown): string {
  if (!e) return '网络异常';
  if (typeof e === 'string') return e;
  if (isRecord(e)) {
    const errMsg = getStringField(e, 'errMsg');
    if (errMsg) return errMsg;
    const message = getStringField(e, 'message');
    if (message) return message;
  }
  return '网络异常';
}

function buildNetworkErrorMessage(err: unknown, url: string): string {
  const msg = normalizeError(err);
  if (/url not in domain list/i.test(msg)) {
    return `网络异常，当前接口域名未加入小程序 request 合法域名：${url}。请到微信公众平台确认已配置该域名为合法域名。`;
  }
  if (/ssl|certificate|handshake/i.test(msg)) {
    return `网络异常，当前接口域名 HTTPS 握手失败：${url}。请检查证书链、TLS 配置以及手机当前网络是否拦截了该域名。原始错误：${msg}`;
  }
  if (/timeout/i.test(msg)) {
    return `网络异常，请求超时：${url}。请检查手机网络、域名解析以及测试服务器连通性。原始错误：${msg}`;
  }
  if (/127\.0\.0\.1|localhost/i.test(url)) {
    return `网络异常，请检查接口地址是否仍指向本机: ${url}`;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isTestApiHost = /^api-test\.anban\.online$/i.test(host);
    const isPrivateIpv4 =
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (parsed.protocol === 'http:' && isPrivateIpv4) {
      return `网络异常，当前接口地址为局域网 HTTP 地址: ${url}。请确认手机与开发机在同一网络，并在微信开发者工具关闭 URL 校验后重新编译。`;
    }
    if (parsed.protocol === 'http:' && !isPrivateIpv4) {
      return `网络异常，当前接口地址不是 HTTPS: ${url}。真机/体验版通常需要已配置的 HTTPS 合法域名。`;
    }
    if (isTestApiHost) {
      return `${msg} (${url})。若当前连接公司或办公 Wi-Fi，测试域名可能被网络策略拦截，请先切换蜂窝网络或个人热点后重试。`;
    }
  } catch {
    return `${msg} (${url})`;
  }
  return `${msg} (${url})`;
}

export async function request<T = unknown>(options: RequestOptions): Promise<ApiResp<T>> {
  const { token, role } = getAuthState();

  const header: RequestHeader = {
    ...getRequestHeader(options.header),
    'X-User-Role': role,
    'X-Client-Id': ensureClientId(),
  };
  const traceId =
    typeof header['X-Debug-Trace-Id'] === 'string' && header['X-Debug-Trace-Id'].trim()
      ? header['X-Debug-Trace-Id'].trim()
      : createRequestTraceId();
  header['X-Debug-Trace-Id'] = traceId;
  saveLastRequestTraceId(traceId);
  if (token) header.Authorization = `Bearer ${token}`;

  const url = (() => {
    const baseUrl = getApiBaseUrl();
    const rawUrl = options.url || '';
    if (/^https?:\/\//.test(rawUrl)) return rawUrl;
    // 规范化 API 路径为版本化 URL（/api/app/... → /api/v1/app/...）
    const versionedPath = normalizeAppApiPath(rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`);
    return `${baseUrl}${versionedPath}`;
  })();

  // 熔断器：公开接口（skipBreaker）不参与熔断，避免部署重启时误伤无需鉴权的页面
  if (!options.skipBreaker && isBackendUnreachable()) {
    return {
      ok: false,
      message: '网络异常，后端服务暂时不可达，已自动切换离线模式。请检查后端服务状态或手机网络。',
      code: 'BACKEND_UNREACHABLE',
    };
  }

  // 设置合理超时，避免后端不可达时默认 60s 超时导致页面长时间白屏
  const requestTimeout = (typeof options.timeout === 'number' && options.timeout > 0)
    ? options.timeout
    : 15000;

  return await new Promise((resolve) => {
    wx.request({
      ...options,
      url,
      header,
      timeout: requestTimeout,
      success: (res) => {
        // 后端可达，清除熔断标记
        markBackendReachable();

        const body = isRecord(res.data) ? res.data : {};
        const bodyData = getRecordField(body, 'data');

        // 约束：接口可返回 role（visitor/customer 或旧枚举）；统一归一为 C 端二态
        if (body?.role !== undefined && body?.role !== null) {
          roleStore.setRole(normalizeToAppRole(body.role));
        } else if (bodyData?.role !== undefined && bodyData.role !== null) {
          roleStore.setRole(normalizeToAppRole(bodyData.role));
        }

        const nextRole = getAuthState().role;

        // 兼容后端 ApiResponse：{ code, msg, data }
        if (typeof body?.code === 'number') {
          if (body.code === 0) {
            resolve({ ok: true, data: body.data as T, role: nextRole });
            return;
          }
          resolve({
            ok: false,
            message: typeof body?.msg === 'string' && body.msg ? body.msg : '请求失败',
            code: body.code,
            role: body?.role !== undefined ? normalizeToAppRole(body.role) : undefined,
          });
          return;
        }

        // 兼容常见返回：{ ok, data, message, code, role }
        if (body && body.ok === true) {
          resolve({ ok: true, data: body.data as T, role: nextRole });
          return;
        }

        // 兼容：HTTP 200 但业务失败
        if (body && body.ok === false) {
          resolve({
            ok: false,
            message: typeof body.message === 'string' && body.message ? body.message : '请求失败',
            code: getErrorCode(body),
            role: body.role !== undefined ? normalizeToAppRole(body.role) : undefined,
          });
          return;
        }

        // 兜底：非标准结构
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, data: body as T, role: nextRole });
          return;
        }

        resolve({
          ok: false,
          message: typeof body?.message === 'string' && body.message ? body.message : `HTTP ${res.statusCode}`,
          code: getErrorCode(body, res.statusCode),
          role: body?.role !== undefined ? normalizeToAppRole(body.role) : undefined,
        });
      },
      fail: (err) => {
        const errMsg = buildNetworkErrorMessage(err, url);
        // 网络/超时错误 → 触发熔断，后续 30s 内所有请求直接跳过
        if (isNetworkError(errMsg)) {
          markBackendUnreachable();
        }
        resolve({ ok: false, message: errMsg });
      },
    });
  });
}

