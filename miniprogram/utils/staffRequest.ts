import { getApiBaseUrl } from '../config/api';
import { getStaffAuthState } from './staffAuth';

export type StaffApiOk<T> = {
  ok: true;
  data: T;
};

export type StaffApiErr = {
  ok: false;
  message: string;
  code?: string | number;
};

export type StaffApiResp<T> = StaffApiOk<T> | StaffApiErr;

type RequestOptions = Omit<WechatMiniprogram.RequestOption, 'success' | 'fail'> & {
  auth?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveUrl(input: string): string {
  const baseUrl = getApiBaseUrl();
  if (/^https?:\/\//.test(input)) return input;
  if (input.startsWith('/')) return `${baseUrl}${input}`;
  return `${baseUrl}/${input}`;
}

export async function staffRequest<T = unknown>(options: RequestOptions): Promise<StaffApiResp<T>> {
  const state = getStaffAuthState();
  const authRequired = options.auth !== false;
  const header: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.header as Record<string, string> | undefined),
  };

  if (authRequired) {
    if (!state.token || !state.adminId) {
      return { ok: false, message: '请先登录工作人员账号' };
    }
    header.Authorization = `Bearer ${state.token}`;
    header['X-Admin-UserId'] = String(state.adminId);
    if (state.role) header['X-Admin-Role'] = state.role;
    if (state.username) header['X-Admin-Username'] = state.username;
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
            resolve({ ok: true, data: body.data as T });
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
          resolve({ ok: true, data: body as T });
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