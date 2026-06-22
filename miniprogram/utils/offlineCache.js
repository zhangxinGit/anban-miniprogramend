/**
 * 离线数据缓存层。
 *
 * 在现有 cache.ts（TTL + 版本缓存）和 networkStatus.ts（熔断器）之上，
 * 提供声明式的「网络优先 → 离线兜底」数据获取模式。
 *
 * 使用方式：
 *   const data = await offlineFirst(
 *     'cache_key',
 *     () => fetchFromServer(),
 *     { ttlMs: 5 * 60_000, showToast: true }
 *   );
 *
 * - 网络正常 → 调 fetcher()，成功后将数据写入 Storage，返回新鲜数据 + fresh=true
 * - 网络失败 → 从 Storage 读取缓存数据返回，同时 showToast 提示用户正在使用离线数据
 * - 无缓存 + 网络失败 → 返回 null（调用方自行处理空状态）
 */
import { getCache, setCache } from './cache';
import { isBackendUnreachable } from './networkStatus';
// ========== Core API ==========
/**
 * 网络优先 → 离线兜底 数据获取器。
 *
 * @param cacheKey  - Storage 缓存 key（建议加前缀 `ab_offline_`）
 * @param fetcher   - 异步数据获取函数（网络请求）
 * @param options   - 可选配置
 * @returns 数据 + fresh 标记；完全无数据时返回 null
 */
export async function offlineFirst(cacheKey, fetcher, options = {}) {
    const { ttlMs = 30 * 60000, // 默认 30 分钟
    showToast = true, staleMessage = '网络异常，正在使用离线数据', honorBreaker = true, } = options;
    // 熔断器激活时，直接走缓存
    if (honorBreaker && isBackendUnreachable()) {
        const cached = getCache(cacheKey);
        if (cached !== null) {
            if (showToast) {
                wx.showToast({ title: staleMessage, icon: 'none', duration: 2000 });
            }
            return { data: cached, fresh: false };
        }
        return null;
    }
    try {
        // 尝试网络请求
        const freshData = await fetcher();
        // 成功 → 写入缓存
        setCache(cacheKey, freshData, ttlMs);
        return { data: freshData, fresh: true };
    }
    catch (error) {
        // 网络失败 → 尝试返回缓存
        const cached = getCache(cacheKey);
        if (cached !== null) {
            if (showToast) {
                wx.showToast({ title: staleMessage, icon: 'none', duration: 2000 });
            }
            return { data: cached, fresh: false };
        }
        // 没有缓存，重新抛出原始错误
        throw error;
    }
}
/**
 * 仅写入离线缓存（不发起网络请求）。
 * 用于首次加载成功后预缓存关键数据。
 */
export function cacheForOffline(cacheKey, data, ttlMs = 30 * 60000) {
    setCache(cacheKey, data, ttlMs);
}
/**
 * 读取离线缓存（不发起网络请求）。
 * 返回 null 表示无缓存或已过期。
 */
export function getOfflineCache(cacheKey) {
    return getCache(cacheKey);
}
/**
 * 清除指定离线缓存。
 */
export function clearOfflineCache(cacheKey) {
    try {
        wx.removeStorageSync(cacheKey);
    }
    catch {
        // ignore
    }
}
/**
 * 批量清除离线缓存（按前缀匹配）。
 */
export function clearOfflineCacheByPrefix(prefix) {
    try {
        const info = wx.getStorageInfoSync();
        const keys = info.keys.filter((k) => k.startsWith(prefix));
        for (const key of keys) {
            wx.removeStorageSync(key);
        }
    }
    catch {
        // ignore
    }
}
