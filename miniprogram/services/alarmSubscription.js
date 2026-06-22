import { request } from '../utils/request';
const STORAGE_KEY = 'ab_alarm_subscribe_state_v1';
function buildState(partial) {
    return {
        status: (partial === null || partial === void 0 ? void 0 : partial.status) || 'unknown',
        message: (partial === null || partial === void 0 ? void 0 : partial.message) || '',
        updatedAt: (partial === null || partial === void 0 ? void 0 : partial.updatedAt) || 0,
        acceptedTemplateIds: Array.isArray(partial === null || partial === void 0 ? void 0 : partial.acceptedTemplateIds) ? partial.acceptedTemplateIds : [],
        rejectedTemplateIds: Array.isArray(partial === null || partial === void 0 ? void 0 : partial.rejectedTemplateIds) ? partial.rejectedTemplateIds : [],
    };
}
function saveState(state) {
    try {
        wx.setStorageSync(STORAGE_KEY, state);
    }
    catch {
        return;
    }
}
function normalizeTemplateIds(payload) {
    const raw = Array.isArray(payload === null || payload === void 0 ? void 0 : payload.template_ids)
        ? payload.template_ids
        : Array.isArray(payload === null || payload === void 0 ? void 0 : payload.templateIds)
            ? payload.templateIds
            : [];
    return raw.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
function normalizeErrorMessage(error) {
    if (typeof error === 'string' && error.trim())
        return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        const message = error.message.trim();
        if (message)
            return message;
    }
    if (error && typeof error === 'object' && 'errMsg' in error && typeof error.errMsg === 'string') {
        const errMsg = error.errMsg.trim();
        if (errMsg)
            return errMsg;
    }
    return '微信告警提醒授权失败，请稍后重试';
}
export function getAlarmSubscribeState() {
    try {
        const value = wx.getStorageSync(STORAGE_KEY);
        if (value && typeof value === 'object') {
            return buildState(value);
        }
    }
    catch {
        return buildState();
    }
    return buildState();
}
export async function getAlarmSubscribeConfig() {
    var _a;
    const resp = await request({
        url: '/api/app/notifications/subscribe-config',
        method: 'GET',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '读取告警提醒配置失败');
    }
    return {
        enabled: Boolean((_a = resp.data) === null || _a === void 0 ? void 0 : _a.enabled),
        templateIds: normalizeTemplateIds(resp.data),
    };
}
export async function requestAlarmSubscription() {
    const config = await getAlarmSubscribeConfig();
    if (!config.enabled || config.templateIds.length === 0) {
        const state = buildState({
            status: 'unavailable',
            message: '当前环境暂未开启微信告警提醒',
            updatedAt: Date.now(),
        });
        saveState(state);
        return state;
    }
    try {
        const result = await new Promise((resolve, reject) => {
            wx.requestSubscribeMessage({
                tmplIds: config.templateIds,
                success: (res) => resolve(res),
                fail: reject,
            });
        });
        const acceptedTemplateIds = [];
        const rejectedTemplateIds = [];
        for (const templateId of config.templateIds) {
            const status = typeof result[templateId] === 'string' ? String(result[templateId]) : '';
            if (status === 'accept') {
                acceptedTemplateIds.push(templateId);
            }
            else if (status) {
                rejectedTemplateIds.push(templateId);
            }
        }
        const state = buildState({
            status: acceptedTemplateIds.length > 0 ? 'accepted' : 'rejected',
            message: acceptedTemplateIds.length > 0 ? '已开启微信告警提醒' : '你暂未开启微信告警提醒',
            updatedAt: Date.now(),
            acceptedTemplateIds,
            rejectedTemplateIds,
        });
        saveState(state);
        return state;
    }
    catch (error) {
        const state = buildState({
            status: 'unavailable',
            message: normalizeErrorMessage(error),
            updatedAt: Date.now(),
        });
        saveState(state);
        throw new Error(state.message);
    }
}
export async function sendAlarmSubscribeTest() {
    var _a, _b;
    const resp = await request({
        url: '/api/app/notifications/test-send',
        method: 'POST',
        data: {},
    });
    if (!resp.ok) {
        throw new Error(resp.message || '发送测试提醒失败');
    }
    return {
        sent: Boolean((_a = resp.data) === null || _a === void 0 ? void 0 : _a.sent),
        message: typeof ((_b = resp.data) === null || _b === void 0 ? void 0 : _b.message) === 'string' && resp.data.message.trim()
            ? resp.data.message.trim()
            : '测试消息已提交给微信，请到服务通知中查看',
    };
}
