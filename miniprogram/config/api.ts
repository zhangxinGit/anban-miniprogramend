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
 */
export const API_BASE_URL = getApiBaseUrl();

