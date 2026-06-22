import { getAuthState } from '../utils/auth';
import { USER_ROLES } from '../shared/roles';
import { getDutyAlarmMeta } from '../shared/dutyStatus';
import { request } from '../utils/request';
import { FORCE_MOCK } from '../config/mock';
import { isDevOfflineFallback, setDevOfflineFallback } from '../utils/devFallback';
import { isDevelopEnv } from '../utils/env';
import { refreshSession } from './sessionAuth';
export async function getEmergencyContacts(deviceId) {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts`,
            method: 'GET',
        });
        if (resp.ok) {
            return Array.isArray(resp.data) ? resp.data : [];
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '加载失败', resp.code)) {
            throw new Error(resp.message || '紧急联系人加载失败');
        }
    }
    return [];
}
export async function addEmergencyContact(deviceId, phone, name) {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts`,
            method: 'POST',
            data: { phone, name: name || undefined },
        });
        if (resp.ok) {
            return resp.data;
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '添加失败', resp.code)) {
            throw new Error(resp.message || '添加紧急联系人失败');
        }
    }
    throw new Error('当前处于离线模式，暂不支持添加紧急联系人');
}
export async function updateEmergencyContact(deviceId, contactId, data) {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts/${encodeURIComponent(contactId)}`,
            method: 'PUT',
            data,
        });
        if (resp.ok) {
            return resp.data;
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '更新失败', resp.code)) {
            throw new Error(resp.message || '更新紧急联系人失败');
        }
    }
    throw new Error('当前处于离线模式，暂不支持更新紧急联系人');
}
export async function removeEmergencyContact(deviceId, contactId) {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts/${encodeURIComponent(contactId)}`,
            method: 'DELETE',
        });
        if (resp.ok) {
            return;
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '删除失败', resp.code)) {
            throw new Error(resp.message || '删除紧急联系人失败');
        }
    }
    throw new Error('当前处于离线模式，暂不支持删除紧急联系人');
}
const STORAGE_KEYS = {
    devices: 'ab_devices',
    alarmRecords: 'ab_device_alarm_records',
};
const FAMILY_STORAGE_KEY = 'ab_family';
function canUseBackendDeviceApi() {
    return !FORCE_MOCK && Boolean(getAuthState().token);
}
function shouldFallbackToLocalDeviceData(message, code) {
    if (code === 401 || code === 403 || code === '401' || code === '403'
        || code === 40002 || code === 40300) {
        return false;
    }
    return /^网络异常/.test(String(message || ''));
}
function normalizeBindDeviceErrorMessage(message) {
    const value = String(message || '').trim();
    if (!value)
        return '绑定失败';
    if (value === 'device not found')
        return '设备未入库，暂不可绑定';
    if (value === 'device deleted')
        return '设备已失效，暂不可绑定';
    if (value === 'device_sn required' || value === 'sn invalid')
        return '请输入设备编号';
    if (value === 'unauthorized')
        return '登录已失效，请重新登录';
    return value;
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
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
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
function parseTime(value) {
    if (!value)
        return Date.now();
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : Date.now();
}
function normalizeRadarTone(value) {
    const tone = String(value || '').trim().toLowerCase();
    if (tone === 'positive' || tone === 'warn' || tone === 'danger' || tone === 'neutral') {
        return tone;
    }
    return 'neutral';
}
function inferRecordTypeCode(recordTypeLabel) {
    if (recordTypeLabel === '求助记录')
        return 'help_record';
    if (recordTypeLabel === '设备异常')
        return 'device_exception';
    return 'alarm_notice';
}
export function normalizeAlarmRecord(raw, fallbackDeviceId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const deviceId = readString((_a = raw.deviceId) !== null && _a !== void 0 ? _a : raw.device_id) || fallbackDeviceId || 'GLOBAL';
    const level = readString((_b = raw.level) !== null && _b !== void 0 ? _b : raw.type) || 'alarm';
    const title = readString((_c = raw.title) !== null && _c !== void 0 ? _c : raw.message) || '设备告警';
    const handled = typeof raw.handled === 'boolean' ? raw.handled : readBoolean((_d = raw.handled) !== null && _d !== void 0 ? _d : raw.read);
    const meta = getDutyAlarmMeta({
        level,
        title,
        deviceId,
        handled,
        recordTypeLabel: readString((_e = raw.recordTypeLabel) !== null && _e !== void 0 ? _e : raw.record_type_label),
        recordTypeClass: ((_f = raw.recordTypeClass) !== null && _f !== void 0 ? _f : raw.record_type_class),
        handledLabel: readString((_g = raw.handledLabel) !== null && _g !== void 0 ? _g : raw.handled_label),
        handledClass: ((_h = raw.handledClass) !== null && _h !== void 0 ? _h : raw.handled_class),
    });
    const createdAt = parseTime(readString((_k = (_j = raw.createdAt) !== null && _j !== void 0 ? _j : raw.occurred_at) !== null && _k !== void 0 ? _k : raw.timestamp));
    return {
        id: readString((_l = raw.id) !== null && _l !== void 0 ? _l : raw.alarm_id) || `${deviceId}_${createdAt}`,
        deviceId,
        deviceSn: readString((_m = raw.deviceSn) !== null && _m !== void 0 ? _m : raw.device_sn) || undefined,
        elderName: readString((_o = raw.elderName) !== null && _o !== void 0 ? _o : raw.elder_name) || undefined,
        address: readString(raw.address) || undefined,
        level,
        alarmType: readString((_p = raw.alarmType) !== null && _p !== void 0 ? _p : raw.alarm_type) || undefined,
        title,
        helpTypeLabel: readString((_q = raw.helpTypeLabel) !== null && _q !== void 0 ? _q : raw.help_type_label) || title,
        detail: readString(raw.detail) || undefined,
        createdAt,
        handled,
        handledLabel: meta.handlingText,
        handledClass: meta.handlingClass,
        recordTypeCode: readString((_r = raw.recordTypeCode) !== null && _r !== void 0 ? _r : raw.record_type_code) || inferRecordTypeCode(meta.recordTypeText),
        recordTypeLabel: meta.recordTypeText,
        recordTypeClass: meta.recordTypeClass,
        sourceEventKey: readString((_s = raw.sourceEventKey) !== null && _s !== void 0 ? _s : raw.source_event_key) || undefined,
    };
}
function getBackendDeviceOnlineStatus(item) {
    var _a;
    if (typeof item.online === 'number') {
        return item.online === 1 ? 'ONLINE' : 'OFFLINE';
    }
    if (typeof item.online === 'boolean') {
        return item.online ? 'ONLINE' : 'OFFLINE';
    }
    const onlineValue = String((_a = item.online) !== null && _a !== void 0 ? _a : '').trim().toLowerCase();
    if (onlineValue === '1' || onlineValue === 'true' || onlineValue === 'online') {
        return 'ONLINE';
    }
    if (onlineValue === '0' || onlineValue === 'false' || onlineValue === 'offline') {
        return 'OFFLINE';
    }
    return String(item.status || '').trim().toLowerCase() === 'online' ? 'ONLINE' : 'OFFLINE';
}
function mapBackendDevice(item) {
    var _a;
    const sn = String(item.deviceName || '').trim();
    const deviceLabel = (item.displayName || '').trim();
    const snSuffix = sn ? sn.slice(-4) : '--';
    const displayName = deviceLabel ? `${deviceLabel} ${snSuffix}` : (sn || '安伴设备');
    const familyId = item.familyId ? String(item.familyId) : null;
    const auth = getAuthState();
    return {
        id: String(item.deviceId),
        name: sn || '安伴设备',
        displayName,
        model: 'AB-GW-01',
        sn,
        installLocation: String((_a = item.installLocation) !== null && _a !== void 0 ? _a : '').trim(),
        ownerUserId: auth.userId || '',
        online: getBackendDeviceOnlineStatus(item),
        battery: { percent: 100, charging: false },
        alarm: { unreadCount: 0 },
        lastSeenAt: parseTime(item.lastActiveTime),
        currentFamilyId: familyId,
        familyBindings: familyId ? [{ familyId, active: true, boundAt: parseTime(item.lastActiveTime) }] : [],
    };
}
function emptyRadarReport(deviceId, message) {
    return {
        deviceId,
        deviceSn: '',
        deviceType: '',
        deviceTypeLabel: '设备',
        reportTitle: '雷达趋势报表',
        reportSubtitle: '按 accepted CTWing 回调聚合摘要卡片、趋势柱图和告警统计',
        windowLabel: '近 7 天 accepted 回调',
        sampleCount: 0,
        hasData: false,
        emptyMessage: message,
        summaryCards: [],
        trendCharts: [],
        alertStats: [],
    };
}
function mapBackendRadarReport(raw, deviceId) {
    if (!raw) {
        return emptyRadarReport(deviceId, '暂无雷达趋势数据');
    }
    return {
        deviceId: readString(raw.deviceId) || deviceId,
        deviceSn: readString(raw.deviceSn),
        deviceType: readString(raw.deviceType),
        deviceTypeLabel: readString(raw.deviceTypeLabel) || '设备',
        reportTitle: readString(raw.reportTitle) || '雷达趋势报表',
        reportSubtitle: readString(raw.reportSubtitle) || '按 accepted CTWing 回调聚合摘要卡片、趋势柱图和告警统计',
        windowLabel: readString(raw.windowLabel) || '近 7 天 accepted 回调',
        sampleCount: Math.max(0, Math.round(readNumber(raw.sampleCount, 0))),
        hasData: readBoolean(raw.hasData),
        emptyMessage: readString(raw.emptyMessage) || '暂无雷达趋势数据',
        summaryCards: Array.isArray(raw.summaryCards)
            ? raw.summaryCards.map((item, index) => ({
                key: readString(item.key) || `summary_${index}`,
                label: readString(item.label) || '指标',
                value: readString(item.value) || '--',
                unit: readString(item.unit),
                hint: readString(item.hint),
                tone: normalizeRadarTone(item.tone),
            }))
            : [],
        trendCharts: Array.isArray(raw.trendCharts)
            ? raw.trendCharts.map((chart, chartIndex) => ({
                key: readString(chart.key) || `chart_${chartIndex}`,
                title: readString(chart.title) || '趋势',
                subtitle: readString(chart.subtitle),
                maxValue: Math.max(1, Math.round(readNumber(chart.maxValue, 1))),
                points: Array.isArray(chart.points)
                    ? chart.points.map((point, pointIndex) => ({
                        label: readString(point.label) || `点 ${pointIndex + 1}`,
                        value: Math.max(0, Math.round(readNumber(point.value, 0))),
                        displayValue: readString(point.displayValue) || '--',
                        tone: normalizeRadarTone(point.tone),
                    }))
                    : [],
            }))
            : [],
        alertStats: Array.isArray(raw.alertStats)
            ? raw.alertStats.map((item, index) => ({
                key: readString(item.key) || `alert_${index}`,
                label: readString(item.label) || '告警',
                count: Math.max(0, Math.round(readNumber(item.count, 0))),
                tone: normalizeRadarTone(item.tone),
            }))
            : [],
    };
}
function uuid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}
function readFamilyIdFromStorage() {
    try {
        const v = wx.getStorageSync(FAMILY_STORAGE_KEY);
        if (v && typeof v === 'object' && typeof v.id === 'string') {
            return String(v.id);
        }
    }
    catch {
        // ignore
    }
    return null;
}
function readBackendFamilyIdFromStorage() {
    const familyId = String(readFamilyIdFromStorage() || '').trim();
    if (!familyId)
        return null;
    return familyId;
}
function migrateDeviceRow(raw) {
    var _a;
    const d = raw;
    const familyBindings = Array.isArray(d.familyBindings) ? [...d.familyBindings] : [];
    let currentFamilyId = d.currentFamilyId !== undefined && d.currentFamilyId !== null
        ? String(d.currentFamilyId)
        : null;
    if (!currentFamilyId) {
        const active = familyBindings.find((b) => b.active);
        currentFamilyId = (_a = active === null || active === void 0 ? void 0 : active.familyId) !== null && _a !== void 0 ? _a : null;
    }
    if (!currentFamilyId && familyBindings.length === 0) {
        const famId = readFamilyIdFromStorage();
        if (famId) {
            return {
                ...d,
                currentFamilyId: famId,
                familyBindings: [{ familyId: famId, active: true, boundAt: d.lastSeenAt || Date.now() }],
            };
        }
    }
    return { ...d, currentFamilyId, familyBindings };
}
function getDevicesFromStorage() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.devices);
        if (Array.isArray(v))
            return v.map(migrateDeviceRow);
    }
    catch {
        // ignore
    }
    return [];
}
function setDevicesToStorage(devices) {
    try {
        wx.setStorageSync(STORAGE_KEYS.devices, devices);
    }
    catch {
        // ignore
    }
}
function getAlarmRecordsFromStorage() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.alarmRecords);
        if (Array.isArray(v))
            return v.map((item) => normalizeAlarmRecord(item));
    }
    catch {
        // ignore
    }
    return [];
}
/** 全量告警（消息中心等聚合使用） */
export function getAllAlarmRecords() {
    ensureSeedDevices();
    return getAlarmRecordsFromStorage();
}
function setAlarmRecordsToStorage(records) {
    try {
        wx.setStorageSync(STORAGE_KEYS.alarmRecords, records);
    }
    catch {
        // ignore
    }
}
function ensureSeedDevices() {
    const exist = getDevicesFromStorage();
    if (exist.length > 0)
        return;
    const st = getAuthState();
    const me = st.userId || 'u_demo';
    const other = 'u_other';
    const famId = readFamilyIdFromStorage();
    const now = Date.now();
    const bind = (familyId) => familyId
        ? {
            currentFamilyId: familyId,
            familyBindings: [{ familyId, active: true, boundAt: now }],
        }
        : { currentFamilyId: null, familyBindings: [] };
    const b = bind(famId);
    const seed = [
        {
            id: uuid('dev'),
            name: '客厅守护器',
            displayName: '客厅守护器 0001',
            model: 'AB-GW-01',
            sn: 'SN-AB-000001',
            installLocation: '客厅',
            ownerUserId: me,
            online: 'ONLINE',
            battery: { percent: 76, charging: false },
            alarm: { unreadCount: 1 },
            lastSeenAt: now - 2 * 60 * 1000,
            ...b,
        },
        {
            id: uuid('dev'),
            name: '卧室守护器',
            displayName: '卧室守护器 0002',
            model: 'AB-GW-01',
            sn: 'SN-AB-000002',
            installLocation: '卧室',
            ownerUserId: other,
            online: 'OFFLINE',
            battery: { percent: 22, charging: false },
            alarm: { unreadCount: 0 },
            lastSeenAt: now - 9 * 60 * 60 * 1000,
            ...b,
        },
    ];
    setDevicesToStorage(seed);
    const dev1 = seed[0].id;
    const dev2 = seed[1].id;
    const alarms = [
        normalizeAlarmRecord({
            id: uuid('al'),
            deviceId: dev1,
            level: 'WARN',
            title: '疑似跌倒告警',
            createdAt: now - 12 * 60 * 1000,
            handled: false,
        }),
        normalizeAlarmRecord({
            id: uuid('al'),
            deviceId: dev1,
            level: 'INFO',
            title: '设备电量下降',
            createdAt: now - 2 * 60 * 60 * 1000,
            handled: true,
        }),
        normalizeAlarmRecord({
            id: uuid('al'),
            deviceId: dev2,
            level: 'CRITICAL',
            title: '设备离线',
            createdAt: now - 4 * 60 * 60 * 1000,
            handled: true,
        }),
    ];
    setAlarmRecordsToStorage(alarms);
}
/**
 * 已成交用户：仅展示「当前家庭」下 active 绑定的设备。
 * 游客无设备列表（路由层拦截进入）。
 */
function isUnauthorizedCode(code) {
    return code === 401 || code === 403 || code === '401' || code === '403'
        || code === 40002 || code === 40300;
}
export async function getDeviceList(role) {
    if (canUseBackendDeviceApi()) {
        const familyId = readBackendFamilyIdFromStorage();
        let resp = await request({
            url: familyId ? `/api/devices?familyId=${encodeURIComponent(familyId)}` : '/api/devices',
            method: 'GET',
        });
        // Token 过期自动刷新后重试一次
        if (!resp.ok && isUnauthorizedCode(resp.code)) {
            console.warn('[getDeviceList] 收到 401/403，尝试刷新 token 后重试...');
            const refreshed = await refreshSession(true);
            if (refreshed) {
                resp = await request({
                    url: familyId ? `/api/devices?familyId=${encodeURIComponent(familyId)}` : '/api/devices',
                    method: 'GET',
                });
            }
        }
        if (resp.ok) {
            setDevOfflineFallback(false);
            return Array.isArray(resp.data) ? resp.data.map(mapBackendDevice) : [];
        }
        // 502/503/504 表示后端/网关暂时不可达，静默返回空列表，让 UI 展示正常的空态而非错误页
        if (resp.code === 502 || resp.code === 503 || resp.code === 504) {
            console.warn(`[getDeviceList] 后端服务暂时不可用 (${resp.code})，返回空列表`);
            return [];
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '设备列表加载失败', resp.code)) {
            console.error('[getDeviceList] 请求失败:', resp.message, 'code:', resp.code);
            throw new Error(resp.message || '设备列表加载失败');
        }
        setDevOfflineFallback(true);
    }
    ensureSeedDevices();
    const devices = getDevicesFromStorage();
    // VISITOR 无设备权限，其余角色（LEAD/CUSTOMER/OPERATOR/ADMIN）均可查看设备
    if (role === USER_ROLES.VISITOR)
        return [];
    const famId = readFamilyIdFromStorage();
    if (!famId)
        return [];
    return devices.filter((d) => d.currentFamilyId === famId);
}
export async function bindDeviceByCode(code) {
    const auth = getAuthState();
    if (canUseBackendDeviceApi()) {
        const sn = code.trim();
        if (!sn)
            throw new Error('请输入设备编号');
        const resp = await request({
            url: '/api/app/device/bind',
            method: 'POST',
            data: { sn },
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            const list = await getDeviceList(getAuthState().role);
            return list.find((item) => item.sn === resp.data.sn) || mapBackendDevice({
                deviceId: String(resp.data.device_id),
                deviceName: resp.data.sn,
                status: 'online',
            });
        }
        const message = normalizeBindDeviceErrorMessage(resp.message || '绑定失败');
        if (!shouldFallbackToLocalDeviceData(message, resp.code)) {
            throw new Error(message);
        }
        if (auth.token) {
            throw new Error(message);
        }
        setDevOfflineFallback(true);
    }
    if (auth.token) {
        throw new Error('当前处于离线联调模式，设备绑定不会同步后台，请先恢复在线后重试');
    }
    const me = auth.userId || 'u_demo';
    if (!code.trim())
        throw new Error('请输入绑定码');
    const now = Date.now();
    const famId = readFamilyIdFromStorage();
    const binding = famId
        ? { currentFamilyId: famId, familyBindings: [{ familyId: famId, active: true, boundAt: now }] }
        : { currentFamilyId: null, familyBindings: [] };
    const d = {
        id: uuid('dev'),
        name: `新设备-${code.slice(-4)}`,
        displayName: `新设备-${code.slice(-4)}`,
        model: 'AB-GW-01',
        sn: `SN-AB-${Math.floor(Math.random() * 900000 + 100000)}`,
        installLocation: '',
        ownerUserId: me,
        online: 'ONLINE',
        battery: { percent: 100, charging: true },
        alarm: { unreadCount: 0 },
        lastSeenAt: now,
        ...binding,
    };
    const devices = getDevicesFromStorage();
    setDevicesToStorage([d, ...devices]);
    return d;
}
export async function setDeviceSelected(ids, selected) {
    void ids;
    void selected;
}
export async function mockBatchMarkRead(deviceIds) {
    const devices = getDevicesFromStorage();
    const set = new Set(deviceIds);
    const next = devices.map((d) => set.has(d.id) ? { ...d, alarm: { unreadCount: 0 } } : d);
    setDevicesToStorage(next);
    const records = getAlarmRecordsFromStorage();
    const nextRecords = records.map((r) => (set.has(r.deviceId) ? normalizeAlarmRecord({ ...r, handled: true }) : r));
    setAlarmRecordsToStorage(nextRecords);
}
export async function mockBatchReboot(deviceIds) {
    const devices = getDevicesFromStorage();
    const set = new Set(deviceIds);
    const now = Date.now();
    const next = devices.map((d) => set.has(d.id) ? { ...d, lastSeenAt: now } : d);
    setDevicesToStorage(next);
}
export function batteryLabel(b) {
    const p = clamp(b.percent | 0, 0, 100);
    return `${p}%${b.charging ? '（充电中）' : ''}`;
}
export async function getDeviceById(deviceId) {
    if (canUseBackendDeviceApi()) {
        const list = await getDeviceList(getAuthState().role);
        return list.find((d) => d.id === deviceId) || null;
    }
    ensureSeedDevices();
    const list = getDevicesFromStorage();
    return list.find((d) => d.id === deviceId) || null;
}
export async function getDeviceAlarmRecords(deviceId) {
    if (canUseBackendDeviceApi()) {
        const familyId = readBackendFamilyIdFromStorage();
        const resp = await request({
            url: familyId
                ? `/api/devices/${encodeURIComponent(deviceId)}/logs?familyId=${encodeURIComponent(familyId)}`
                : `/api/devices/${encodeURIComponent(deviceId)}/logs`,
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return Array.isArray(resp.data)
                ? resp.data.map((item) => normalizeAlarmRecord(item, deviceId))
                : [];
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '设备告警加载失败', resp.code)) {
            throw new Error(resp.message || '设备告警加载失败');
        }
        setDevOfflineFallback(true);
    }
    ensureSeedDevices();
    const records = getAlarmRecordsFromStorage().filter((r) => r.deviceId === deviceId);
    return records.sort((a, b) => b.createdAt - a.createdAt);
}
export async function getDeviceRadarReport(deviceId) {
    if (canUseBackendDeviceApi()) {
        const familyId = readBackendFamilyIdFromStorage();
        const resp = await request({
            url: familyId
                ? `/api/devices/${encodeURIComponent(deviceId)}/radar-report?familyId=${encodeURIComponent(familyId)}`
                : `/api/devices/${encodeURIComponent(deviceId)}/radar-report`,
            method: 'GET',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return mapBackendRadarReport(resp.data, deviceId);
        }
        if (!shouldFallbackToLocalDeviceData(resp.message || '设备雷达报表加载失败', resp.code)) {
            throw new Error(resp.message || '设备雷达报表加载失败');
        }
        setDevOfflineFallback(true);
    }
    ensureSeedDevices();
    const localDevice = getDevicesFromStorage().find((item) => item.id === deviceId);
    const supportMessage = localDevice
        ? '当前离线演示数据未接入真实雷达回调，报表需连接测试环境查看'
        : '仅睡眠雷达和存在跌倒雷达支持该报表';
    return emptyRadarReport(deviceId, supportMessage);
}
export async function renameDevice(deviceId, name) {
    const v = name.trim();
    if (!v)
        throw new Error('名称不能为空');
    const devices = getDevicesFromStorage();
    const next = devices.map((d) => {
        if (d.id !== deviceId)
            return d;
        const snSuffix = d.sn ? d.sn.slice(-4) : '';
        return { ...d, name: v, displayName: snSuffix ? `${v} ${snSuffix}` : v };
    });
    setDevicesToStorage(next);
}
/**
 * 从当前家庭解绑：结束 active、写入 unboundAt、清空 currentFamilyId，保留 familyBindings 历史。
 * 绑定新家庭前须先调用本函数（或员工端等价接口）。
 */
export async function unbindDevice(deviceId) {
    ensureSeedDevices();
    const now = Date.now();
    const devices = getDevicesFromStorage();
    const next = devices.map((d) => {
        if (d.id !== deviceId)
            return d;
        const familyBindings = (d.familyBindings || []).map((b) => b.active ? { ...b, active: false, unboundAt: now } : b);
        return { ...d, currentFamilyId: null, familyBindings };
    });
    setDevicesToStorage(next);
}
/**
 * 将已有设备绑定到指定家庭（演示：同步员工端 / 后台结果）。
 * 若仍存在当前家庭绑定且与 target 不一致 → 抛错，强制先 unbindDevice。
 */
export async function bindDeviceToFamily(deviceId, familyId) {
    const fid = familyId.trim();
    if (!fid)
        throw new Error('家庭 ID 无效');
    ensureSeedDevices();
    const now = Date.now();
    const devices = getDevicesFromStorage();
    const idx = devices.findIndex((x) => x.id === deviceId);
    if (idx < 0)
        throw new Error('设备不存在');
    const d = devices[idx];
    const cur = d.currentFamilyId;
    if (cur && cur !== fid) {
        throw new Error('设备已绑定其他家庭，请先解绑后再绑定新家庭');
    }
    if (cur === fid)
        return;
    let familyBindings = [...(d.familyBindings || [])];
    if (!cur) {
        familyBindings = familyBindings.map((b) => { var _a; return b.active ? { ...b, active: false, unboundAt: (_a = b.unboundAt) !== null && _a !== void 0 ? _a : now } : b; });
    }
    familyBindings.push({ familyId: fid, active: true, boundAt: now });
    const next = [...devices];
    next[idx] = { ...d, currentFamilyId: fid, familyBindings };
    setDevicesToStorage(next);
}
export async function transferDevice(deviceId, targetUserId) {
    const t = targetUserId.trim();
    if (!t)
        throw new Error('请输入转让目标');
    const devices = getDevicesFromStorage();
    const next = devices.map((d) => (d.id === deviceId ? { ...d, ownerUserId: t } : d));
    setDevicesToStorage(next);
}
function recordEmergencyHelpLocally() {
    var _a;
    ensureSeedDevices();
    const devices = getDevicesFromStorage();
    const deviceId = ((_a = devices[0]) === null || _a === void 0 ? void 0 : _a.id) || 'GLOBAL';
    const now = Date.now();
    const rec = normalizeAlarmRecord({
        id: uuid('al'),
        deviceId,
        level: 'CRITICAL',
        title: '一键求助',
        createdAt: now,
        handled: false,
    });
    const records = getAlarmRecordsFromStorage();
    setAlarmRecordsToStorage([rec, ...records].slice(0, 200));
    if (devices.length === 0)
        return;
    const nextDevices = devices.map((d) => d.id === deviceId ? { ...d, alarm: { unreadCount: (d.alarm.unreadCount || 0) + 1 } } : d);
    setDevicesToStorage(nextDevices);
}
/** 一键求助：优先写入后端 help_tickets + alarm，开发态离线时回退到本地告警 */
export async function recordEmergencyHelp() {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: '/api/app/help-tickets/sos',
            method: 'POST',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return;
        }
        const message = resp.message || '求助发送失败';
        if (!shouldFallbackToLocalDeviceData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(message);
        }
        setDevOfflineFallback(true);
        recordEmergencyHelpLocally();
        return;
    }
    if (!FORCE_MOCK && !isDevelopEnv() && !isDevOfflineFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    recordEmergencyHelpLocally();
}
/**
 * 发起一键求助并返回工单详情（供首页展示工单号等信息）。
 * 仅在正式后端环境下返回完整数据，离线/开发态返回 null。
 */
export async function initiateEmergencyHelp() {
    if (canUseBackendDeviceApi()) {
        const resp = await request({
            url: '/api/app/help-tickets/sos',
            method: 'POST',
        });
        if (resp.ok) {
            setDevOfflineFallback(false);
            return resp.data;
        }
        const message = resp.message || '求助发送失败';
        if (!shouldFallbackToLocalDeviceData(message, resp.code) || !isDevelopEnv()) {
            throw new Error(message);
        }
        setDevOfflineFallback(true);
        recordEmergencyHelpLocally();
        return null;
    }
    if (!FORCE_MOCK && !isDevelopEnv() && !isDevOfflineFallback()) {
        throw new Error('登录已失效，请重新登录');
    }
    recordEmergencyHelpLocally();
    return null;
}
