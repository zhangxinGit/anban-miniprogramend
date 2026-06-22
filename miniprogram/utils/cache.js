/**
 * 通用缓存工具 —— 支持 TTL 过期缓存 + 版本感知缓存
 *
 * TTL 缓存（兼容旧用法）：数据在有效期内直接返回，过期自动清理。
 * 版本缓存（新增）：数据携带版本号，小程序通过比对版本来决定是否使用缓存，
 *   实现"后台无更新时直接用本地缓存，达到首屏秒开"。
 */
/**
 * 读取 TTL 缓存，过期返回 null 并自动清理
 */
export function getCache(key) {
    try {
        const raw = wx.getStorageSync(key);
        if (!raw || typeof raw !== 'object')
            return null;
        const entry = raw;
        if (!entry || typeof entry.t !== 'number' || typeof entry.ttl !== 'number')
            return null;
        if (Date.now() - entry.t > entry.ttl) {
            wx.removeStorageSync(key);
            return null;
        }
        return entry.d;
    }
    catch {
        return null;
    }
}
/**
 * 写入 TTL 缓存，ttlMs 为有效毫秒数
 */
export function setCache(key, data, ttlMs) {
    try {
        const entry = { d: data, t: Date.now(), ttl: ttlMs };
        wx.setStorageSync(key, entry);
    }
    catch {
        // Storage 写入失败静默忽略
    }
}
/**
 * 保存带版本号的缓存
 */
export function setVersionedCache(key, data, version) {
    try {
        const entry = { d: data, v: version, t: Date.now() };
        wx.setStorageSync(key, entry);
    }
    catch {
        // ignore
    }
}
/**
 * 读取版本缓存：只有版本完全匹配时才返回数据，否则返回 null。
 * 用于"版本不匹配 → 强制重新请求"的场景。
 */
export function getVersionedCache(key, expectedVersion) {
    try {
        const raw = wx.getStorageSync(key);
        if (!raw || typeof raw !== 'object')
            return null;
        const entry = raw;
        if (!entry || typeof entry.v !== 'string' || typeof entry.t !== 'number')
            return null;
        if (entry.v === expectedVersion) {
            return entry.d;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * 读取版本缓存的数据（忽略版本号），始终返回数据和版本号。
 * 用于首屏秒开场景：先用任意版本数据立即渲染，再后台比对版本决定是否刷新。
 */
export function getVersionedCacheAny(key) {
    try {
        const raw = wx.getStorageSync(key);
        if (!raw || typeof raw !== 'object')
            return null;
        const entry = raw;
        if (!entry || entry.d === undefined || typeof entry.v !== 'string')
            return null;
        return { data: entry.d, version: entry.v };
    }
    catch {
        return null;
    }
}
/**
 * 检查缓存的版本是否与当前版本一致。
 * 返回 true 表示缓存版本与当前版本一致（无需重新请求），false 表示版本已变化。
 */
export function isVersionedCacheFresh(key, currentVersion) {
    try {
        const raw = wx.getStorageSync(key);
        if (!raw || typeof raw !== 'object')
            return false;
        const entry = raw;
        return typeof entry.v === 'string' && entry.v === currentVersion;
    }
    catch {
        return false;
    }
}
/**
 * 手动清除某条缓存
 */
export function clearCache(key) {
    try {
        wx.removeStorageSync(key);
    }
    catch {
        // ignore
    }
}
