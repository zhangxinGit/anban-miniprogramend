import { isDevelopEnv } from './env';
import { FORCE_MOCK } from '../config/mock';
const KEY = 'ab_dev_offline_fallback';
export function isDevOfflineFallback() {
    // 纯前端联调：强制走离线兜底（不请求后端）
    if (FORCE_MOCK)
        return true;
    if (!isDevelopEnv())
        return false;
    try {
        return Boolean(wx.getStorageSync(KEY));
    }
    catch {
        return false;
    }
}
export function setDevOfflineFallback(v) {
    try {
        if (!v)
            wx.removeStorageSync(KEY);
        else
            wx.setStorageSync(KEY, 1);
    }
    catch {
        // ignore
    }
}
