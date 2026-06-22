/**
 * 评估强提醒弹窗状态管理
 *
 * 核心规则：
 * 1. 每次打开小程序（含扫码进入）自动触发弹窗判断
 * 2. 已提交测评 → 永久豁免
 * 3. 本次会话已关闭 → 会话内不再弹（app 冷/热启动后清除）
 * 4. 未登录 / 已登录未测评 → 每次启动强制弹出（无 24 小时间隔限制）
 *
 * 数据存储（wx.storage）：
 *   ab_assess_completed       boolean  是否已完成测评（提交成功即永久标记）
 *   ab_assess_session_closed  boolean  本次会话是否已关闭弹窗（app 冷/热启动后清除）
 *   ab_assess_last_popup      number   最近一次弹窗时间戳（ms），（保留记录，不再用于拦截）
 *   ab_assess_popup_pending   boolean  需要弹窗的信号（跨页面传递）
 */
const STORAGE_KEYS = {
    completed: 'ab_assess_completed',
    sessionClosed: 'ab_assess_session_closed',
    lastPopup: 'ab_assess_last_popup',
    pending: 'ab_assess_popup_pending',
};
/* ---- 标记已完成测评（测评提交成功后调用，永久豁免） ---- */
export function markAssessmentCompleted() {
    try {
        wx.setStorageSync(STORAGE_KEYS.completed, true);
    }
    catch {
        // ignore
    }
}
/** 查询是否已完成测评 */
export function isAssessmentCompleted() {
    try {
        return wx.getStorageSync(STORAGE_KEYS.completed) === true;
    }
    catch {
        return false;
    }
}
/* ---- 本次会话关闭标记（app 启动时清除，用户点稍后评估/关闭时设置） ---- */
export function markSessionClosed() {
    try {
        wx.setStorageSync(STORAGE_KEYS.sessionClosed, true);
    }
    catch {
        // ignore
    }
}
export function isSessionClosed() {
    try {
        return wx.getStorageSync(STORAGE_KEYS.sessionClosed) === true;
    }
    catch {
        return false;
    }
}
/** app 启动时清除会话关闭标记，恢复弹窗能力 */
export function resetSessionClosed() {
    try {
        wx.removeStorageSync(STORAGE_KEYS.sessionClosed);
    }
    catch {
        // ignore
    }
}
/* ---- 1 天间隔控制 ---- */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function getLastPopupTime() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.lastPopup);
        return typeof v === 'number' && v > 0 ? v : 0;
    }
    catch {
        return 0;
    }
}
function setLastPopupTime(ts) {
    try {
        wx.setStorageSync(STORAGE_KEYS.lastPopup, ts);
    }
    catch {
        // ignore
    }
}
/* ---- 综合判断：是否应该弹出（已登录用户） ---- */
export function shouldShowPopupForLoggedInUser() {
    // 豁免 1：已完成测评（永久）
    if (isAssessmentCompleted())
        return false;
    // 豁免 2：本次会话已关闭
    if (isSessionClosed())
        return false;
    // 已登录未测评 → 每次冷/热启动强制弹出（不再有 24 小时间隔限制）
    return true;
}
/* ---- 记录弹窗已展示（弹窗出现时调用，用于 1 天间隔） ---- */
export function recordPopupShown() {
    setLastPopupTime(Date.now());
}
/* ---- 弹窗信号（跨页面传递：首页 → 我的页） ---- */
/** 标记“需要展示评估弹窗” */
export function markAssessmentPopup(source) {
    try {
        const state = { active: true, source, ts: Date.now() };
        wx.setStorageSync(STORAGE_KEYS.pending, state);
    }
    catch {
        // ignore
    }
}
/** 读取并消费弹窗信号（一次性，读完即清除） */
export function consumeAssessmentPopup() {
    try {
        const raw = wx.getStorageSync(STORAGE_KEYS.pending);
        if (!raw || typeof raw !== 'object')
            return null;
        const state = raw;
        // 10 分钟内有效
        if (Date.now() - (state.ts || 0) > 10 * 60000) {
            wx.removeStorageSync(STORAGE_KEYS.pending);
            return null;
        }
        if (state.active !== true)
            return null;
        wx.removeStorageSync(STORAGE_KEYS.pending);
        return state;
    }
    catch {
        return null;
    }
}
/** 手动清除弹窗信号 */
export function clearAssessmentPopup() {
    try {
        wx.removeStorageSync(STORAGE_KEYS.pending);
    }
    catch {
        // ignore
    }
}
/* ---- 服务端同步：以数据库为准，纠正 localStorage 状态不一致 ---- */
let _syncPromise = null;
/**
 * 从服务端同步评估完成状态
 * - 服务端有记录 → 标记 localStorage 为已完成
 * - 服务端无记录 → 清除 localStorage 已完成标记（解决删库后弹窗不出现的问题）
 * 同一时刻只允许一次同步请求（去重）
 */
export async function syncAssessmentCompletedFromServer() {
    if (_syncPromise)
        return _syncPromise;
    _syncPromise = (async () => {
        try {
            // 动态导入 request，避免 utils 层循环依赖
            const { request } = await import('./request');
            const resp = await request({
                url: '/api/app/safety/has-assessment',
                method: 'GET',
            });
            if (resp.ok && resp.data) {
                const serverAssessed = resp.data.assessed === true;
                if (serverAssessed) {
                    markAssessmentCompleted();
                }
                else {
                    // 服务端无评估记录 → 清除本地标记（关键修复）
                    try {
                        wx.removeStorageSync(STORAGE_KEYS.completed);
                    }
                    catch { }
                }
                return serverAssessed;
            }
        }
        catch {
            // 网络异常：降级使用本地缓存，不改变状态
        }
        finally {
            _syncPromise = null;
        }
        return isAssessmentCompleted();
    })();
    return _syncPromise;
}
