import { getEnvVersion } from '../utils/env';

type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

const LEGACY_API_BASE_URL_KEY = 'ab_api_base_url';
const STALE_API_BASE_URL_KEYS = [LEGACY_API_BASE_URL_KEY, 'ab_api_base_url_v2', 'ab_api_base_url_v3', 'ab_api_base_url_v4'];
const FORCED_API_BASE_URL = '';

const DEFAULT_API_BASE_URLS: Record<MiniProgramEnvVersion, string> = {
	develop: 'https://api-test.anban.online',
	trial: 'https://api-test.anban.online',
	release: 'https://api.anban.online',
};

export const DEFAULT_DEV_API_BASE_URL = DEFAULT_API_BASE_URLS.develop;
export const DEFAULT_TRIAL_API_BASE_URL = DEFAULT_API_BASE_URLS.trial;
export const DEFAULT_RELEASE_API_BASE_URL = DEFAULT_API_BASE_URLS.release;

/**
 * API 当前主版本号。
 * 用于 URL 路径版本化，如 /api/v1/app/products。
 * 升级时改为 'v2' 即可全量切换。
 */
export const API_VERSION = 'v1' as string;

/**
 * 将小程序 API 路径规范化为版本化 URL。
 *
 * 输入模式                     → 输出版本化路径
 * /api/app/products            → /api/v1/app/products
 * /app/api/products            → /api/v1/app/products
 * /api/v1/app/products         → /api/v1/app/products (不变)
 * /api/v2/app/products         → /api/v2/app/products (不变)
 */
export function normalizeAppApiPath(path: string): string {
	// 已经是版本化路径
	if (/^\/api\/v\d+\//.test(path)) return path;

	// /api/app/... → /api/v1/app/...（标准后端路径）
	const m1 = /^\/api\/(app\/.*)$/.exec(path);
	if (m1) return `/api/${API_VERSION}/${m1[1]}`;

	// /app/api/... → /api/v1/app/...（历史 Nginx 反向路径）
	const m2 = /^\/app\/api\/(.*)$/.exec(path);
	if (m2) return `/api/${API_VERSION}/app/${m2[1]}`;

	// 其他 /api/... 路径
	const m3 = /^\/api\/(.*)$/.exec(path);
	if (m3) return `/api/${API_VERSION}/${m3[1]}`;

	// 非 /api 开头的路径保持原样（如 /ws/...、/internal/...）
	return path;
}

function normalizeApiBaseUrl(value: string): string {
	const next = value.trim().replace(/\/$/, '');
	if (!/^https?:\/\//.test(next)) {
		throw new Error('接口地址需以 http:// 或 https:// 开头');
	}
	return next;
}

function clearStaleApiBaseUrlOverrides() {
	for (const key of STALE_API_BASE_URL_KEYS) {
		try {
			wx.removeStorageSync(key);
		} catch {
			continue;
		}
	}
}

function readForcedApiBaseUrl(): string {
	try {
		return FORCED_API_BASE_URL ? normalizeApiBaseUrl(FORCED_API_BASE_URL) : '';
	} catch {
		return '';
	}
}

export function getDefaultApiBaseUrl(): string {
	return readForcedApiBaseUrl() || DEFAULT_API_BASE_URLS[getEnvVersion()];
}

export function getApiBaseUrl(): string {
	try {
		clearStaleApiBaseUrlOverrides();
	} catch {
		// ignore stale local overrides removal failure and keep using env default
	}
	return getDefaultApiBaseUrl();
}

/**
 * 小程序接口基地址。
 * - develop 默认指向测试环境域名，确保开发版与体验版默认命中同一测试后端
 * - trial 默认指向预发布测试域名
 * - release 默认指向正式生产域名
 * - 临时联调期间可通过 FORCED_API_BASE_URL 强制覆盖成当前可用的 HTTPS 隧道域名
 * - 已移除本地接口地址覆盖能力，统一只按编译环境选择测试/生产后端
 * - 历史缓存里的 ab_api_base_url_v* 会在运行时自动清理，避免旧地址继续污染体验版/正式版
 * - 线上发布前应改为已配置到小程序后台 request 合法域名的 HTTPS 地址
 * - API 版本化通过 normalizeAppApiPath() 在请求时拼接 /api/v1/ 前缀
 */
export const API_BASE_URL = getApiBaseUrl();

