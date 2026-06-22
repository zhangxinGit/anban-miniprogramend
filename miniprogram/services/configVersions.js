/**
 * 配置版本号服务 —— 从后端拉取各区域的配置版本 map，
 * 与本地缓存版本对比，决定是否需要重新请求数据。
 *
 * 版本格式：`count_maxUpdatedEpoch`，如 "4_1718000000000"
 * 任何数据变更都会导致版本号变化（count 或 maxUpdatedAt 变化）。
 */
import { request } from '../utils/request';
const VERSIONS_CACHE_KEY = 'ab_config_versions_v1';
/** 缓存的版本号最长有效 5 分钟（后端自身缓存 30s，这里做兜底） */
const VERSIONS_CACHE_TTL = 5 * 60 * 1000;
/**
 * 拉取后端最新配置版本号。
 * 优先使用本地缓存（5 分钟内有效），避免每次切换 Tab 都发网络请求。
 */
export async function fetchConfigVersions() {
    // 先尝试读取本地缓存（5 分钟 TTL 内直接返回，零网络开销）
    const cached = getCachedVersions();
    if (cached) {
        return cached;
    }
    const resp = await request({
        url: '/api/app/config/versions',
        method: 'GET',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '加载配置版本失败');
    }
    const versions = resp.data;
    // 本地缓存最新版本号，用于断网/后台失败时兜底 + Tab 切换快速返回
    try {
        wx.setStorageSync(VERSIONS_CACHE_KEY, { d: versions, t: Date.now() });
    }
    catch { /* ignore */ }
    return versions;
}
/**
 * 读取上次缓存的版本号（用于对比）
 */
export function getCachedVersions() {
    try {
        const raw = wx.getStorageSync(VERSIONS_CACHE_KEY);
        if (!raw || typeof raw !== 'object')
            return null;
        const entry = raw;
        if (!entry.d || typeof entry.t !== 'number')
            return null;
        // 5 分钟以内的缓存直接使用（减少请求）
        if (Date.now() - entry.t > VERSIONS_CACHE_TTL)
            return null;
        return entry.d;
    }
    catch {
        return null;
    }
}
/**
 * 检查某个配置段是否需要刷新
 * @param cachedVersion 本地缓存的版本号
 * @param serverVersion 服务端最新版本号
 * @returns true 表示需要重新请求
 */
export function needsRefresh(cachedVersion, serverVersion) {
    if (!cachedVersion)
        return true; // 无缓存 → 必须刷新
    if (cachedVersion !== serverVersion)
        return true; // 版本不一致 → 刷新
    return false; // 版本一致 → 无需刷新
}
