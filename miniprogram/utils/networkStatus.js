/**
 * 后端可达性状态管理（Circuit Breaker）+ 设备网络监控
 *
 * 当任一后端请求因网络/超时失败时，标记后端为"不可达"状态，持续 30 秒。
 * 在此期间所有后续请求直接返回网络错误，不再等待超时。
 *
 * 同时监控设备网络状态（WiFi/4G/无网络），用于 UI 离线提示。
 *
 * 适用于：后端服务宕机、DNS 不可解析、办公网络拦截测试域名等场景。
 */
const BACKEND_STATUS_KEY = 'ab_backend_unreachable_until';
const UNREACHABLE_DURATION_MS = 30000;
/** 当前设备网络类型（启动时同步获取一次） */
let _currentNetworkType = 'unknown';
let _networkListeners = [];
let _networkListenerInstalled = false;
/** 检查后端当前是否被标记为不可达 */
export function isBackendUnreachable() {
    try {
        const until = wx.getStorageSync(BACKEND_STATUS_KEY);
        // 兼容小程序 storage 返回 number 类型（不一定是 number）
        const ts = typeof until === 'number' ? until : Number(until);
        if (Number.isFinite(ts) && ts > Date.now()) {
            return true;
        }
    }
    catch {
        // ignore
    }
    return false;
}
/** 标记后端不可达，持续时间 30 秒 */
export function markBackendUnreachable() {
    try {
        wx.setStorageSync(BACKEND_STATUS_KEY, Date.now() + UNREACHABLE_DURATION_MS);
        console.warn('[NetworkStatus] 后端不可达，已启用 30s 熔断，期间将跳过所有后端请求');
    }
    catch {
        // ignore
    }
}
/** 标记后端已恢复可达 */
export function markBackendReachable() {
    try {
        wx.removeStorageSync(BACKEND_STATUS_KEY);
    }
    catch {
        // ignore
    }
}
/** 判断错误是否为网络/超时类（非业务错误），用于决定是否触发熔断 */
export function isNetworkError(message) {
    return /^网络异常/.test(String(message || ''));
}
/** 判断错误是否为 timeout */
export function isTimeoutError(message) {
    return /timeout|超时/i.test(String(message || ''));
}
// ========== 设备网络状态监控 ==========
function _notifyListeners(online) {
    // 防御性拷贝，避免监听器回调中修改数组导致遍历异常
    const listeners = _networkListeners.slice();
    for (const fn of listeners) {
        try {
            fn(online);
        }
        catch {
            // ignore listener errors
        }
    }
}
/**
 * 安装全局网络状态监听（幂等，只安装一次）。
 * 应在 app.ts onLaunch 中调用。
 */
export function installNetworkListener() {
    if (_networkListenerInstalled)
        return;
    _networkListenerInstalled = true;
    // 同步获取初始网络状态
    wx.getNetworkType({
        success: (res) => {
            _currentNetworkType = (res.networkType || 'unknown');
        },
    });
    // 监听网络状态变化
    wx.onNetworkStatusChange((res) => {
        const prevOnline = _currentNetworkType !== 'none';
        _currentNetworkType = (res.networkType || 'unknown');
        const nowOnline = res.isConnected;
        // 从离线恢复在线时，清除熔断标记，允许立即重试
        if (!prevOnline && nowOnline) {
            markBackendReachable();
        }
        _notifyListeners(nowOnline);
    });
}
/**
 * 当前设备是否联网（基于 wx.getNetworkType 和 onNetworkStatusChange）。
 * 注意：设备联网不代表后端可达，仅表示设备有 WiFi/蜂窝连接。
 */
export function isDeviceOnline() {
    return _currentNetworkType !== 'none' && _currentNetworkType !== 'unknown';
}
/**
 * 订阅网络状态变化。
 * @returns 取消订阅函数
 */
export function onNetworkChange(listener) {
    _networkListeners.push(listener);
    return () => {
        const idx = _networkListeners.indexOf(listener);
        if (idx >= 0) {
            _networkListeners.splice(idx, 1);
        }
    };
}
/**
 * 判断当前是否完全不可用（设备离线 或 后端熔断）。
 * 用于 UI 层的离线状态判断。
 */
export function isFullyOffline() {
    return !isDeviceOnline() || isBackendUnreachable();
}
