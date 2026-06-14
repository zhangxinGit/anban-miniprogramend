/**
 * 后端可达性状态管理（Circuit Breaker）
 *
 * 当任一后端请求因网络/超时失败时，标记后端为"不可达"状态，持续 30 秒。
 * 在此期间所有后续请求直接返回网络错误，不再等待超时。
 *
 * 适用于：后端服务宕机、DNS 不可解析、办公网络拦截测试域名等场景。
 */

const BACKEND_STATUS_KEY = 'ab_backend_unreachable_until';
const UNREACHABLE_DURATION_MS = 30_000;

/** 检查后端当前是否被标记为不可达 */
export function isBackendUnreachable(): boolean {
  try {
    const until = wx.getStorageSync(BACKEND_STATUS_KEY);
    // 兼容小程序 storage 返回 number 类型（不一定是 number）
    const ts = typeof until === 'number' ? until : Number(until);
    if (Number.isFinite(ts) && ts > Date.now()) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** 标记后端不可达，持续时间 30 秒 */
export function markBackendUnreachable(): void {
  try {
    wx.setStorageSync(BACKEND_STATUS_KEY, Date.now() + UNREACHABLE_DURATION_MS);
    console.warn('[NetworkStatus] 后端不可达，已启用 30s 熔断，期间将跳过所有后端请求');
  } catch {
    // ignore
  }
}

/** 标记后端已恢复可达 */
export function markBackendReachable(): void {
  try {
    wx.removeStorageSync(BACKEND_STATUS_KEY);
  } catch {
    // ignore
  }
}

/** 判断错误是否为网络/超时类（非业务错误），用于决定是否触发熔断 */
export function isNetworkError(message: string): boolean {
  return /^网络异常/.test(String(message || ''));
}

/** 判断错误是否为 timeout */
export function isTimeoutError(message: string): boolean {
  return /timeout|超时/i.test(String(message || ''));
}
