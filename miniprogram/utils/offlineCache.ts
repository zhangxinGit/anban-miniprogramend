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

// ========== Types ==========

export type OfflineCacheOptions = {
  /** 缓存有效时长（毫秒），超时后网络失败也不返回。默认 30 分钟 */
  ttlMs?: number;
  /** 是否在返回离线数据时自动 showToast 提示。默认 true */
  showToast?: boolean;
  /** Toast 提示文案。默认 "正在使用离线数据" */
  staleMessage?: string;
  /** 是否在熔断器激活时也尝试返回缓存（而非直接失败）。默认 true */
  honorBreaker?: boolean;
};

export type OfflineResult<T> = {
  /** 数据 */
  data: T;
  /** 是否为新鲜数据（来自网络）还是缓存兜底 */
  fresh: boolean;
};

// ========== Core API ==========

/**
 * 网络优先 → 离线兜底 数据获取器。
 *
 * @param cacheKey  - Storage 缓存 key（建议加前缀 `ab_offline_`）
 * @param fetcher   - 异步数据获取函数（网络请求）
 * @param options   - 可选配置
 * @returns 数据 + fresh 标记；完全无数据时返回 null
 */
export async function offlineFirst<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: OfflineCacheOptions = {},
): Promise<OfflineResult<T> | null> {
  const {
    ttlMs = 30 * 60_000,       // 默认 30 分钟
    showToast = true,
    staleMessage = '网络异常，正在使用离线数据',
    honorBreaker = true,
  } = options;

  // 熔断器激活时，直接走缓存
  if (honorBreaker && isBackendUnreachable()) {
    const cached = getCache<T>(cacheKey);
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
  } catch (error: unknown) {
    // 网络失败 → 尝试返回缓存
    const cached = getCache<T>(cacheKey);
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
export function cacheForOffline<T>(cacheKey: string, data: T, ttlMs = 30 * 60_000): void {
  setCache(cacheKey, data, ttlMs);
}

/**
 * 读取离线缓存（不发起网络请求）。
 * 返回 null 表示无缓存或已过期。
 */
export function getOfflineCache<T>(cacheKey: string): T | null {
  return getCache<T>(cacheKey);
}

/**
 * 清除指定离线缓存。
 */
export function clearOfflineCache(cacheKey: string): void {
  try {
    wx.removeStorageSync(cacheKey);
  } catch {
    // ignore
  }
}

/**
 * 批量清除离线缓存（按前缀匹配）。
 */
export function clearOfflineCacheByPrefix(prefix: string): void {
  try {
    const info = wx.getStorageInfoSync();
    const keys = info.keys.filter((k) => k.startsWith(prefix));
    for (const key of keys) {
      wx.removeStorageSync(key);
    }
  } catch {
    // ignore
  }
}
