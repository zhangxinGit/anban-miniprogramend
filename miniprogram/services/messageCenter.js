import { getAuthState } from '../utils/auth';
import { request } from '../utils/request';
import { FORCE_MOCK } from '../config/mock';
import { isDevelopEnv } from '../utils/env';
import { isDevOfflineFallback, setDevOfflineFallback } from '../utils/devFallback';
import { roleStore } from '../store/roleStore';
import { canAccess } from '../utils/acl';
import { getAllAlarmRecords, getDeviceAlarmRecords, getDeviceList, normalizeAlarmRecord } from './deviceCenter';
import { isDealed } from '../utils/permission';
const STORAGE_KEYS = {
    systemNotices: 'ab_system_notices',
    familyNotices: 'ab_family_notices',
};
function uuid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function canUseBackendNotificationApi() {
    return !FORCE_MOCK && Boolean(getAuthState().token);
}
function canUseLocalNoticeFallback() {
    return FORCE_MOCK || isDevelopEnv() || isDevOfflineFallback();
}
function isAuthError(code, message) {
    if (code === 401 || code === 403 || code === '401' || code === '403'
        || code === 40002 || code === 40300)
        return true;
    const msg = String(message || '').trim().toLowerCase();
    return msg === 'unauthorized' || msg === 'unauthenticated' || msg === 'forbidden';
}
const AUTH_ERROR_USER_MESSAGE = '登录已失效，请重新登录';
function shouldFallbackToLocalNoticeData(message, code) {
    if (isAuthError(code, message)) {
        return false;
    }
    if (/^网络异常/.test(String(message || ''))) {
        return true;
    }
    return isDevOfflineFallback();
}
function parseTime(value) {
    if (!value)
        return Date.now();
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : Date.now();
}
function readBoolean(value) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
}
function readNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function normalizeNotice(raw, fallbackPrefix) {
    var _a;
    return {
        id: String((_a = raw.id) !== null && _a !== void 0 ? _a : uuid(fallbackPrefix)),
        title: typeof raw.title === 'string' ? raw.title.trim() : '',
        content: typeof raw.content === 'string' ? raw.content.trim() : '',
        createdAt: parseTime(raw.created_at),
        read: readBoolean(raw.read),
        sourceEventKey: typeof raw.source_event_key === 'string' ? raw.source_event_key.trim() : undefined,
        sourceType: typeof raw.source_type === 'string' ? raw.source_type.trim() : undefined,
        helpTicketId: raw.help_ticket_id == null ? undefined : String(raw.help_ticket_id),
        alarmType: typeof raw.alarm_type === 'string' ? raw.alarm_type.trim() : undefined,
        helpTypeLabel: typeof raw.help_type_label === 'string' ? raw.help_type_label.trim() : undefined,
        elderName: typeof raw.elder_name === 'string' ? raw.elder_name.trim() : undefined,
        elderPhone: typeof raw.elder_phone === 'string' ? raw.elder_phone.trim() : undefined,
        address: typeof raw.address === 'string' ? raw.address.trim() : undefined,
        businessStatus: String(raw.business_status || '').trim().toLowerCase() === 'closed' ? 'closed' : 'pending',
    };
}
function buildPageResult(items, page, size, total, hasMore) {
    return {
        items,
        total,
        page,
        size,
        hasMore: typeof hasMore === 'boolean' ? hasMore : (page + 1) * size < total,
    };
}
function buildFallbackPage(rows, page, size) {
    const normalizedPage = Math.max(0, page);
    const normalizedSize = Math.max(1, size);
    const start = normalizedPage * normalizedSize;
    return buildPageResult(rows.slice(start, start + normalizedSize), normalizedPage, normalizedSize, rows.length, start + normalizedSize < rows.length);
}
async function fetchNotices(category, fallback, fallbackPrefix) {
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: `/api/app/notifications/messages?category=${category}`,
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return Array.isArray(resp.data)
                ? resp.data.map((item) => normalizeNotice(item, fallbackPrefix)).sort((a, b) => b.createdAt - a.createdAt)
                : [];
        }
        const message = resp.message || '消息加载失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    return fallback().sort((a, b) => b.createdAt - a.createdAt);
}
async function fetchNoticePage(category, page, size, fallback, fallbackPrefix) {
    const normalizedPage = Math.max(0, page);
    const normalizedSize = Math.max(1, size);
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: `/api/app/notifications/messages?category=${category}&page=${normalizedPage}&size=${normalizedSize}`,
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            const data = resp.data || {};
            const items = Array.isArray(data.items)
                ? data.items.map((item) => normalizeNotice(item, fallbackPrefix))
                : [];
            return buildPageResult(items, readNumber(data.page, normalizedPage), readNumber(data.size, normalizedSize), readNumber(data.total, items.length), readBoolean(data.has_more));
        }
        const message = resp.message || '消息加载失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    return buildFallbackPage(fallback().sort((a, b) => b.createdAt - a.createdAt), normalizedPage, normalizedSize);
}
async function createNotice(category, input, fallback, fallbackPrefix) {
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: '/api/app/notifications/messages',
            method: 'POST',
            data: {
                category,
                title: (input.title || '').trim(),
                content: (input.content || '').trim(),
            },
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            if (resp.data) {
                return normalizeNotice(resp.data, fallbackPrefix);
            }
            throw new Error('消息发送失败');
        }
        const message = resp.message || '消息发送失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    return fallback();
}
export async function markMessageRead(messageId) {
    const normalizedId = String(messageId || '').trim();
    if (!normalizedId || normalizedId === 'noop')
        return;
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: `/api/app/notifications/messages/${encodeURIComponent(normalizedId)}/read`,
            method: 'POST',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return;
        }
        const message = resp.message || '消息已读写回失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    const system = getSystemNoticesFromStorage();
    const family = getFamilyNoticesFromStorage();
    let touched = false;
    const nextSystem = system.map((item) => {
        if (item.id !== normalizedId || item.read)
            return item;
        touched = true;
        return { ...item, read: true };
    });
    const nextFamily = family.map((item) => {
        if (item.id !== normalizedId || item.read)
            return item;
        touched = true;
        return { ...item, read: true };
    });
    if (touched) {
        setSystemNoticesToStorage(nextSystem);
        setFamilyNoticesToStorage(nextFamily);
    }
}
function getSystemNoticesFromStorage() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.systemNotices);
        if (Array.isArray(v))
            return v;
    }
    catch {
        // ignore
    }
    return [];
}
function setSystemNoticesToStorage(list) {
    try {
        wx.setStorageSync(STORAGE_KEYS.systemNotices, list);
    }
    catch {
        // ignore
    }
}
function ensureSeedSystemNotices() {
    const exist = getSystemNoticesFromStorage();
    if (exist.length > 0)
        return;
    const now = Date.now();
    const seed = [
        {
            id: uuid('sn'),
            title: '欢迎使用安伴',
            content: '完成安全自查，获取风险等级与居家建议。',
            createdAt: now - 3 * 60 * 60 * 1000,
            read: false,
        },
        {
            id: uuid('sn'),
            title: '功能提示',
            content: '成交后可在“设备中心”查看设备在线、告警与电量，也可呼叫安伴客服。',
            createdAt: now - 26 * 60 * 60 * 1000,
            read: true,
        },
    ];
    setSystemNoticesToStorage(seed);
}
export async function getSystemNoticePage(page = 0, size = 20) {
    return await fetchNoticePage('system', page, size, () => {
        ensureSeedSystemNotices();
        return getSystemNoticesFromStorage();
    }, 'sn');
}
export async function getFamilyNoticePage(page = 0, size = 20) {
    return await fetchNoticePage('family', page, size, () => getFamilyNoticesFromStorage(), 'fn');
}
export async function getMessageDeviceAlarmPage(role, page = 0, size = 20) {
    const normalizedPage = Math.max(0, page);
    const normalizedSize = Math.max(1, size);
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: `/api/app/notifications/device-alarms?page=${normalizedPage}&size=${normalizedSize}`,
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            const data = resp.data || {};
            const items = Array.isArray(data.items)
                ? data.items.map((item) => normalizeAlarmRecord(item))
                : [];
            return buildPageResult(items, readNumber(data.page, normalizedPage), readNumber(data.size, normalizedSize), readNumber(data.total, items.length), readBoolean(data.has_more));
        }
        const message = resp.message || '告警值守加载失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    return buildFallbackPage(await getDeviceAlarms(role), normalizedPage, normalizedSize);
}
export async function getSystemNotices() {
    return (await getSystemNoticePage(0, 50)).items;
}
export async function pushSystemNotice(input) {
    const { role } = roleStore.getState();
    if (!canAccess(role, 'page.message')) {
        return { id: 'noop', title: '', content: '', createdAt: Date.now(), read: true };
    }
    return await createNotice('system', input, () => {
        ensureSeedSystemNotices();
        const now = Date.now();
        const notice = {
            id: uuid('sn'),
            title: (input.title || '').trim() || '系统消息',
            content: (input.content || '').trim(),
            createdAt: now,
            read: false,
        };
        const list = getSystemNoticesFromStorage();
        setSystemNoticesToStorage([notice, ...list].slice(0, 50));
        return notice;
    }, 'sn');
}
function getFamilyNoticesFromStorage() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.familyNotices);
        if (Array.isArray(v))
            return v;
    }
    catch {
        // ignore
    }
    return [];
}
function setFamilyNoticesToStorage(list) {
    try {
        wx.setStorageSync(STORAGE_KEYS.familyNotices, list);
    }
    catch {
        // ignore
    }
}
export async function getFamilyNotices() {
    return (await getFamilyNoticePage(0, 50)).items;
}
export async function pushFamilyNotice(input) {
    const { role } = roleStore.getState();
    if (!canAccess(role, 'page.message')) {
        return { id: 'noop', title: '', content: '', createdAt: Date.now(), read: true };
    }
    return await createNotice('family', input, () => {
        const now = Date.now();
        const notice = {
            id: uuid('fn'),
            title: (input.title || '').trim() || '家庭通知',
            content: (input.content || '').trim(),
            createdAt: now,
            read: false,
        };
        const list = getFamilyNoticesFromStorage();
        setFamilyNoticesToStorage([notice, ...list].slice(0, 50));
        return notice;
    }, 'fn');
}
export async function getDeviceAlarms(role) {
    const devices = await getDeviceList(role);
    const alarmsByDevice = await Promise.all(devices.map((device) => getDeviceAlarmRecords(device.id).catch(() => [])));
    const syntheticGlobal = getAllAlarmRecords().filter((alarm) => alarm.deviceId === 'GLOBAL');
    return [...alarmsByDevice.flat(), ...syntheticGlobal].sort((a, b) => b.createdAt - a.createdAt);
}
export async function getUnreadStat(role) {
    if (!canAccess(role, 'page.message')) {
        return { system: 0, deviceAlarm: 0, family: 0, total: 0 };
    }
    if (canUseBackendNotificationApi()) {
        const resp = await request({
            url: '/api/app/notifications/messages/unread-stats',
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            const data = resp.data || {};
            const system = readNumber(data.system, 0);
            const deviceAlarm = readNumber(data.device_alarm, 0);
            const family = readNumber(data.family, 0);
            const total = readNumber(data.total, system + deviceAlarm + family);
            return { system, deviceAlarm, family, total };
        }
        const message = resp.message || '未读数加载失败';
        if (!shouldFallbackToLocalNoticeData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(isAuthError(resp.code, message) ? AUTH_ERROR_USER_MESSAGE : message);
        }
        setDevOfflineFallback(true);
    }
    else if (!canUseLocalNoticeFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    const sys = (await getSystemNotices()).filter((n) => !n.read).length;
    const dev = isDealed(role) ? (await getDeviceAlarms(role)).filter((a) => !a.handled).length : 0;
    const fam = isDealed(role) ? (await getFamilyNotices()).filter((n) => !n.read).length : 0;
    return { system: sys, deviceAlarm: dev, family: fam, total: sys + dev + fam };
}
export function formatTime(ts) {
    const d = new Date(ts);
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}
