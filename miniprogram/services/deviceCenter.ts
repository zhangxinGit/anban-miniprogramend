import { getAuthState } from '../utils/auth';
import { USER_ROLES, type UserRole } from '../shared/roles';
import { getDutyAlarmMeta, type DutyAlarmHandlingClass, type DutyAlarmToneClass } from '../shared/dutyStatus';
import { request } from '../utils/request';
import { FORCE_MOCK } from '../config/mock';
import { isDevOfflineFallback, setDevOfflineFallback } from '../utils/devFallback';
import { isDevelopEnv } from '../utils/env';
import { refreshSession } from './sessionAuth';

/**
 * 设备 ↔ 家庭（核心规则）
 * - 同一设备可有多条家庭绑定记录（历史 1:N），但同一时间仅允许 **一条 active = true**（当前 1:1）。
 * - **更换家庭**：必须先对当前绑定执行解绑（active=false、currentFamilyId=null），再绑定新家庭；禁止在未解绑时直接切换到另一家庭。
 * - C 端仅展示与变更后果；实际写绑定由员工端 / 后台完成（方式 A：直接生效 + 服务端日志）。
 */

export type DeviceOnlineStatus = 'ONLINE' | 'OFFLINE';

export type DeviceBattery = {
  percent: number; // 0-100
  charging?: boolean;
};

export type DeviceAlarm = {
  unreadCount: number;
};

/** 设备与家庭：历史可多家庭；同一时刻仅一条 active（见文件头规则说明） */
export type DeviceFamilyBinding = {
  familyId: string;
  active: boolean;
  boundAt: number;
  unboundAt?: number;
};

export type Device = {
  id: string;
  name: string;
  displayName: string;
  model: string;
  sn: string;
  installLocation?: string;
  /** 演示：设备台账归属；与家庭绑定 currentFamilyId 解耦 */
  ownerUserId: string;
  online: DeviceOnlineStatus;
  battery: DeviceBattery;
  alarm: DeviceAlarm;
  lastSeenAt: number;
  /** 当前生效的家庭绑定，同一时间仅一个；null 表示未绑定家庭 */
  currentFamilyId: string | null;
  familyBindings: DeviceFamilyBinding[];
};

export type DeviceAlarmRecord = {
  id: string;
  deviceId: string;
  deviceSn?: string;
  elderName?: string;
  address?: string;
  level: string;
  alarmType?: string;
  title: string;
  helpTypeLabel?: string;
  detail?: string;
  createdAt: number;
  handled: boolean;
  handledLabel: string;
  handledClass: DutyAlarmHandlingClass;
  recordTypeCode: string;
  recordTypeLabel: string;
  recordTypeClass: DutyAlarmToneClass;
  sourceEventKey?: string;
};

export type DeviceRadarReportTone = 'positive' | 'warn' | 'danger' | 'neutral';

export type DeviceRadarReportSummaryCard = {
  key: string;
  label: string;
  value: string;
  unit: string;
  hint: string;
  tone: DeviceRadarReportTone;
};

export type DeviceRadarReportTrendPoint = {
  label: string;
  value: number;
  displayValue: string;
  tone: DeviceRadarReportTone;
};

export type DeviceRadarReportTrendChart = {
  key: string;
  title: string;
  subtitle: string;
  maxValue: number;
  points: DeviceRadarReportTrendPoint[];
};

export type DeviceRadarReportAlertStat = {
  key: string;
  label: string;
  count: number;
  tone: DeviceRadarReportTone;
};

/** 紧急联系人 */
export type EmergencyContact = {
  id: number;
  phone: string;
  name: string | null;
  enabled: number;
  createdAt: string | null;
};

export async function getEmergencyContacts(deviceId: string): Promise<EmergencyContact[]> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<EmergencyContact[]>({
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

export async function addEmergencyContact(deviceId: string, phone: string, name?: string): Promise<EmergencyContact> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<EmergencyContact>({
      url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts`,
      method: 'POST',
      data: { phone, name: name || undefined },
    });
    if (resp.ok) {
      return resp.data!;
    }
    if (!shouldFallbackToLocalDeviceData(resp.message || '添加失败', resp.code)) {
      throw new Error(resp.message || '添加紧急联系人失败');
    }
  }
  throw new Error('当前处于离线模式，暂不支持添加紧急联系人');
}

export async function updateEmergencyContact(
  deviceId: string,
  contactId: number,
  data: { name?: string; enabled?: boolean }
): Promise<EmergencyContact> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<EmergencyContact>({
      url: `/api/app/devices/${encodeURIComponent(deviceId)}/emergency-contacts/${encodeURIComponent(contactId)}`,
      method: 'PUT',
      data,
    });
    if (resp.ok) {
      return resp.data!;
    }
    if (!shouldFallbackToLocalDeviceData(resp.message || '更新失败', resp.code)) {
      throw new Error(resp.message || '更新紧急联系人失败');
    }
  }
  throw new Error('当前处于离线模式，暂不支持更新紧急联系人');
}

export async function removeEmergencyContact(deviceId: string, contactId: number): Promise<void> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<void>({
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

export type DeviceRadarReport = {
  deviceId: string;
  deviceSn: string;
  deviceType: string;
  deviceTypeLabel: string;
  reportTitle: string;
  reportSubtitle: string;
  windowLabel: string;
  sampleCount: number;
  hasData: boolean;
  emptyMessage: string;
  summaryCards: DeviceRadarReportSummaryCard[];
  trendCharts: DeviceRadarReportTrendChart[];
  alertStats: DeviceRadarReportAlertStat[];
};

const STORAGE_KEYS = {
  devices: 'ab_devices',
  alarmRecords: 'ab_device_alarm_records',
} as const;

const FAMILY_STORAGE_KEY = 'ab_family';

type BackendDeviceItem = {
  deviceId: string;
  deviceName: string;
  displayName?: string | null;
  familyId?: string;
  status?: string;
  online?: number | boolean | string | null;
  lastActiveTime?: string | null;
  installLocation?: string | null;
};

type BackendDeviceAlarmItem = {
  alarm_id?: number | string;
  device_id?: number | string;
  device_sn?: string | null;
  elder_name?: string | null;
  address?: string | null;
  level?: string | null;
  alarm_type?: string | null;
  record_type_code?: string | null;
  record_type_label?: string | null;
  record_type_class?: DutyAlarmToneClass | null;
  title?: string | null;
  help_type_label?: string | null;
  detail?: string | null;
  handled?: boolean | number | string | null;
  handled_label?: string | null;
  handled_class?: DutyAlarmHandlingClass | null;
  source_event_key?: string | null;
  occurred_at?: string | null;
  timestamp?: string | null;
  type?: string | null;
  message?: string | null;
};

type BackendDeviceRadarReportSummaryCard = {
  key?: string | null;
  label?: string | null;
  value?: string | number | null;
  unit?: string | null;
  hint?: string | null;
  tone?: DeviceRadarReportTone | string | null;
};

type BackendDeviceRadarReportTrendPoint = {
  label?: string | null;
  value?: number | string | null;
  displayValue?: string | number | null;
  tone?: DeviceRadarReportTone | string | null;
};

type BackendDeviceRadarReportTrendChart = {
  key?: string | null;
  title?: string | null;
  subtitle?: string | null;
  maxValue?: number | string | null;
  points?: BackendDeviceRadarReportTrendPoint[] | null;
};

type BackendDeviceRadarReportAlertStat = {
  key?: string | null;
  label?: string | null;
  count?: number | string | null;
  tone?: DeviceRadarReportTone | string | null;
};

type BackendDeviceRadarReport = {
  deviceId?: string | number | null;
  deviceSn?: string | null;
  deviceType?: string | null;
  deviceTypeLabel?: string | null;
  reportTitle?: string | null;
  reportSubtitle?: string | null;
  windowLabel?: string | null;
  sampleCount?: number | string | null;
  hasData?: boolean | number | string | null;
  emptyMessage?: string | null;
  summaryCards?: BackendDeviceRadarReportSummaryCard[] | null;
  trendCharts?: BackendDeviceRadarReportTrendChart[] | null;
  alertStats?: BackendDeviceRadarReportAlertStat[] | null;
};

function canUseBackendDeviceApi(): boolean {
  return !FORCE_MOCK && Boolean(getAuthState().token);
}

function shouldFallbackToLocalDeviceData(message: string, code?: string | number): boolean {
  if (code === 401 || code === 403 || code === '401' || code === '403'
      || code === 40002 || code === 40300) {
    return false;
  }
  return /^网络异常/.test(String(message || ''));
}

function normalizeBindDeviceErrorMessage(message: string): string {
  const value = String(message || '').trim();
  if (!value) return '绑定失败';
  if (value === 'device not found') return '设备未入库，暂不可绑定';
  if (value === 'device deleted') return '设备已失效，暂不可绑定';
  if (value === 'device_sn required' || value === 'sn invalid') return '请输入设备编号';
  if (value === 'unauthorized') return '登录已失效，请重新登录';
  return value;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function readNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseTime(value?: string | null): number {
  if (!value) return Date.now();
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Date.now();
}

function normalizeRadarTone(value: unknown): DeviceRadarReportTone {
  const tone = String(value || '').trim().toLowerCase();
  if (tone === 'positive' || tone === 'warn' || tone === 'danger' || tone === 'neutral') {
    return tone;
  }
  return 'neutral';
}

function inferRecordTypeCode(recordTypeLabel: string): string {
  if (recordTypeLabel === '求助记录') return 'help_record';
  if (recordTypeLabel === '设备异常') return 'device_exception';
  return 'alarm_notice';
}

export function normalizeAlarmRecord(raw: Partial<DeviceAlarmRecord> & Record<string, unknown>, fallbackDeviceId?: string): DeviceAlarmRecord {
  const deviceId = readString(raw.deviceId ?? raw.device_id) || fallbackDeviceId || 'GLOBAL';
  const level = readString(raw.level ?? raw.type) || 'alarm';
  const title = readString(raw.title ?? raw.message) || '设备告警';
  const handled = typeof raw.handled === 'boolean' ? raw.handled : readBoolean(raw.handled ?? raw.read);
  const meta = getDutyAlarmMeta({
    level,
    title,
    deviceId,
    handled,
    recordTypeLabel: readString(raw.recordTypeLabel ?? raw.record_type_label),
    recordTypeClass: (raw.recordTypeClass ?? raw.record_type_class) as DutyAlarmToneClass | null | undefined,
    handledLabel: readString(raw.handledLabel ?? raw.handled_label),
    handledClass: (raw.handledClass ?? raw.handled_class) as DutyAlarmHandlingClass | null | undefined,
  });
  const createdAt = parseTime(readString(raw.createdAt ?? raw.occurred_at ?? raw.timestamp));
  return {
    id: readString(raw.id ?? raw.alarm_id) || `${deviceId}_${createdAt}`,
    deviceId,
    deviceSn: readString(raw.deviceSn ?? raw.device_sn) || undefined,
    elderName: readString(raw.elderName ?? raw.elder_name) || undefined,
    address: readString(raw.address) || undefined,
    level,
    alarmType: readString(raw.alarmType ?? raw.alarm_type) || undefined,
    title,
    helpTypeLabel: readString(raw.helpTypeLabel ?? raw.help_type_label) || title,
    detail: readString(raw.detail) || undefined,
    createdAt,
    handled,
    handledLabel: meta.handlingText,
    handledClass: meta.handlingClass,
    recordTypeCode: readString(raw.recordTypeCode ?? raw.record_type_code) || inferRecordTypeCode(meta.recordTypeText),
    recordTypeLabel: meta.recordTypeText,
    recordTypeClass: meta.recordTypeClass,
    sourceEventKey: readString(raw.sourceEventKey ?? raw.source_event_key) || undefined,
  };
}

function getBackendDeviceOnlineStatus(item: BackendDeviceItem): DeviceOnlineStatus {
  if (typeof item.online === 'number') {
    return item.online === 1 ? 'ONLINE' : 'OFFLINE';
  }
  if (typeof item.online === 'boolean') {
    return item.online ? 'ONLINE' : 'OFFLINE';
  }
  const onlineValue = String(item.online ?? '').trim().toLowerCase();
  if (onlineValue === '1' || onlineValue === 'true' || onlineValue === 'online') {
    return 'ONLINE';
  }
  if (onlineValue === '0' || onlineValue === 'false' || onlineValue === 'offline') {
    return 'OFFLINE';
  }
  return String(item.status || '').trim().toLowerCase() === 'online' ? 'ONLINE' : 'OFFLINE';
}

function mapBackendDevice(item: BackendDeviceItem): Device {
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
    installLocation: String(item.installLocation ?? '').trim(),
    ownerUserId: auth.userId || '',
    online: getBackendDeviceOnlineStatus(item),
    battery: { percent: 100, charging: false },
    alarm: { unreadCount: 0 },
    lastSeenAt: parseTime(item.lastActiveTime),
    currentFamilyId: familyId,
    familyBindings: familyId ? [{ familyId, active: true, boundAt: parseTime(item.lastActiveTime) }] : [],
  };
}

function emptyRadarReport(deviceId: string, message: string): DeviceRadarReport {
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

function mapBackendRadarReport(raw: BackendDeviceRadarReport | null | undefined, deviceId: string): DeviceRadarReport {
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

function uuid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readFamilyIdFromStorage(): string | null {
  try {
    const v = wx.getStorageSync(FAMILY_STORAGE_KEY);
    if (v && typeof v === 'object' && typeof (v as any).id === 'string') {
      return String((v as any).id);
    }
  } catch {
    // ignore
  }
  return null;
}

function readBackendFamilyIdFromStorage(): string | null {
  const familyId = String(readFamilyIdFromStorage() || '').trim();
  if (!familyId) return null;
  return familyId;
}

function migrateDeviceRow(raw: any): Device {
  const d = raw as Device;
  const familyBindings = Array.isArray(d.familyBindings) ? [...d.familyBindings] : [];
  let currentFamilyId =
    d.currentFamilyId !== undefined && d.currentFamilyId !== null
      ? String(d.currentFamilyId)
      : null;
  if (!currentFamilyId) {
    const active = familyBindings.find((b: DeviceFamilyBinding) => b.active);
    currentFamilyId = active?.familyId ?? null;
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

function getDevicesFromStorage(): Device[] {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.devices);
    if (Array.isArray(v)) return (v as any[]).map(migrateDeviceRow);
  } catch {
    // ignore
  }
  return [];
}

function setDevicesToStorage(devices: Device[]) {
  try {
    wx.setStorageSync(STORAGE_KEYS.devices, devices);
  } catch {
    // ignore
  }
}

function getAlarmRecordsFromStorage(): DeviceAlarmRecord[] {
  try {
    const v = wx.getStorageSync(STORAGE_KEYS.alarmRecords);
    if (Array.isArray(v)) return (v as Array<Record<string, unknown>>).map((item) => normalizeAlarmRecord(item));
  } catch {
    // ignore
  }
  return [];
}

/** 全量告警（消息中心等聚合使用） */
export function getAllAlarmRecords(): DeviceAlarmRecord[] {
  ensureSeedDevices();
  return getAlarmRecordsFromStorage();
}

function setAlarmRecordsToStorage(records: DeviceAlarmRecord[]) {
  try {
    wx.setStorageSync(STORAGE_KEYS.alarmRecords, records);
  } catch {
    // ignore
  }
}

function ensureSeedDevices() {
  const exist = getDevicesFromStorage();
  if (exist.length > 0) return;

  const st = getAuthState();
  const me = st.userId || 'u_demo';
  const other = 'u_other';
  const famId = readFamilyIdFromStorage();
  const now = Date.now();

  const bind = (familyId: string | null): Pick<Device, 'currentFamilyId' | 'familyBindings'> =>
    familyId
      ? {
          currentFamilyId: familyId,
          familyBindings: [{ familyId, active: true, boundAt: now }],
        }
      : { currentFamilyId: null, familyBindings: [] };

  const b = bind(famId);
  const seed: Device[] = [
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
  const alarms: DeviceAlarmRecord[] = [
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
function isUnauthorizedCode(code: unknown): boolean {
  return code === 401 || code === 403 || code === '401' || code === '403'
      || code === 40002 || code === 40300;
}

export async function getDeviceList(role: UserRole): Promise<Device[]> {
  if (canUseBackendDeviceApi()) {
    const familyId = readBackendFamilyIdFromStorage();
    let resp = await request<BackendDeviceItem[]>({
      url: familyId ? `/api/devices?familyId=${encodeURIComponent(familyId)}` : '/api/devices',
      method: 'GET',
    });

    // Token 过期自动刷新后重试一次
    if (!resp.ok && isUnauthorizedCode(resp.code)) {
      console.warn('[getDeviceList] 收到 401/403，尝试刷新 token 后重试...');
      const refreshed = await refreshSession(true);
      if (refreshed) {
        resp = await request<BackendDeviceItem[]>({
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
  if (role === USER_ROLES.VISITOR) return [];

  const famId = readFamilyIdFromStorage();
  if (!famId) return [];

  return devices.filter((d) => d.currentFamilyId === famId);
}

export async function bindDeviceByCode(code: string): Promise<Device> {
  const auth = getAuthState();
  if (canUseBackendDeviceApi()) {
    const sn = code.trim();
    if (!sn) throw new Error('请输入设备编号');
    const resp = await request<{ device_id: number; sn: string }>({
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
  if (!code.trim()) throw new Error('请输入绑定码');
  const now = Date.now();
  const famId = readFamilyIdFromStorage();
  const binding = famId
    ? { currentFamilyId: famId, familyBindings: [{ familyId: famId, active: true, boundAt: now }] }
    : { currentFamilyId: null as string | null, familyBindings: [] as DeviceFamilyBinding[] };

  const d: Device = {
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

export async function setDeviceSelected(ids: string[], selected: boolean): Promise<void> {
  void ids;
  void selected;
}

export async function mockBatchMarkRead(deviceIds: string[]) {
  const devices = getDevicesFromStorage();
  const set = new Set(deviceIds);
  const next = devices.map((d) =>
    set.has(d.id) ? { ...d, alarm: { unreadCount: 0 } } : d,
  );
  setDevicesToStorage(next);

  const records = getAlarmRecordsFromStorage();
  const nextRecords = records.map((r) => (set.has(r.deviceId) ? normalizeAlarmRecord({ ...r, handled: true }) : r));
  setAlarmRecordsToStorage(nextRecords);
}

export async function mockBatchReboot(deviceIds: string[]) {
  const devices = getDevicesFromStorage();
  const set = new Set(deviceIds);
  const now = Date.now();
  const next = devices.map((d) =>
    set.has(d.id) ? { ...d, lastSeenAt: now } : d,
  );
  setDevicesToStorage(next);
}

export function batteryLabel(b: DeviceBattery): string {
  const p = clamp(b.percent | 0, 0, 100);
  return `${p}%${b.charging ? '（充电中）' : ''}`;
}

export async function getDeviceById(deviceId: string): Promise<Device | null> {
  if (canUseBackendDeviceApi()) {
    const list = await getDeviceList(getAuthState().role);
    return list.find((d) => d.id === deviceId) || null;
  }
  ensureSeedDevices();
  const list = getDevicesFromStorage();
  return list.find((d) => d.id === deviceId) || null;
}

export async function getDeviceAlarmRecords(deviceId: string): Promise<DeviceAlarmRecord[]> {
  if (canUseBackendDeviceApi()) {
    const familyId = readBackendFamilyIdFromStorage();
    const resp = await request<BackendDeviceAlarmItem[]>({
      url: familyId
        ? `/api/devices/${encodeURIComponent(deviceId)}/logs?familyId=${encodeURIComponent(familyId)}`
        : `/api/devices/${encodeURIComponent(deviceId)}/logs`,
      method: 'GET',
    });
    if (resp.ok) {
      setDevOfflineFallback(false);
      return Array.isArray(resp.data)
        ? resp.data.map((item) => normalizeAlarmRecord(item as Record<string, unknown>, deviceId))
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

export async function getDeviceRadarReport(deviceId: string): Promise<DeviceRadarReport> {
  if (canUseBackendDeviceApi()) {
    const familyId = readBackendFamilyIdFromStorage();
    const resp = await request<BackendDeviceRadarReport>({
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

export async function renameDevice(deviceId: string, name: string): Promise<void> {
  const v = name.trim();
  if (!v) throw new Error('名称不能为空');
  const devices = getDevicesFromStorage();
  const next = devices.map((d) => {
    if (d.id !== deviceId) return d;
    const snSuffix = d.sn ? d.sn.slice(-4) : '';
    return { ...d, name: v, displayName: snSuffix ? `${v} ${snSuffix}` : v };
  });
  setDevicesToStorage(next);
}

/**
 * 从当前家庭解绑：结束 active、写入 unboundAt、清空 currentFamilyId，保留 familyBindings 历史。
 * 绑定新家庭前须先调用本函数（或员工端等价接口）。
 */
export async function unbindDevice(deviceId: string): Promise<void> {
  ensureSeedDevices();
  const now = Date.now();
  const devices = getDevicesFromStorage();
  const next = devices.map((d) => {
    if (d.id !== deviceId) return d;
    const familyBindings = (d.familyBindings || []).map((b) =>
      b.active ? { ...b, active: false, unboundAt: now } : b,
    );
    return { ...d, currentFamilyId: null as string | null, familyBindings };
  });
  setDevicesToStorage(next);
}

/**
 * 将已有设备绑定到指定家庭（演示：同步员工端 / 后台结果）。
 * 若仍存在当前家庭绑定且与 target 不一致 → 抛错，强制先 unbindDevice。
 */
export async function bindDeviceToFamily(deviceId: string, familyId: string): Promise<void> {
  const fid = familyId.trim();
  if (!fid) throw new Error('家庭 ID 无效');

  ensureSeedDevices();
  const now = Date.now();
  const devices = getDevicesFromStorage();
  const idx = devices.findIndex((x) => x.id === deviceId);
  if (idx < 0) throw new Error('设备不存在');

  const d = devices[idx];
  const cur = d.currentFamilyId;
  if (cur && cur !== fid) {
    throw new Error('设备已绑定其他家庭，请先解绑后再绑定新家庭');
  }
  if (cur === fid) return;

  let familyBindings = [...(d.familyBindings || [])];
  if (!cur) {
    familyBindings = familyBindings.map((b) =>
      b.active ? { ...b, active: false, unboundAt: b.unboundAt ?? now } : b,
    );
  }
  familyBindings.push({ familyId: fid, active: true, boundAt: now });

  const next = [...devices];
  next[idx] = { ...d, currentFamilyId: fid, familyBindings };
  setDevicesToStorage(next);
}

export async function transferDevice(deviceId: string, targetUserId: string): Promise<void> {
  const t = targetUserId.trim();
  if (!t) throw new Error('请输入转让目标');
  const devices = getDevicesFromStorage();
  const next = devices.map((d) => (d.id === deviceId ? { ...d, ownerUserId: t } : d));
  setDevicesToStorage(next);
}

function recordEmergencyHelpLocally(): void {
  ensureSeedDevices();
  const devices = getDevicesFromStorage();
  const deviceId = devices[0]?.id || 'GLOBAL';
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

  if (devices.length === 0) return;
  const nextDevices = devices.map((d) =>
    d.id === deviceId ? { ...d, alarm: { unreadCount: (d.alarm.unreadCount || 0) + 1 } } : d,
  );
  setDevicesToStorage(nextDevices);
}

/** 一键求助返回的工单视图 */
export type SosTicketResult = {
  ticket_id: number;
  ticket_no: string;
  elder_name: string;
  address: string;
  status: string;
  status_label: string;
  status_class: string;
  occurred_at: string;
};

/** 一键求助：优先写入后端 help_tickets + alarm，开发态离线时回退到本地告警 */
export async function recordEmergencyHelp(): Promise<void> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<Record<string, unknown>>({
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
export async function initiateEmergencyHelp(): Promise<SosTicketResult | null> {
  if (canUseBackendDeviceApi()) {
    const resp = await request<SosTicketResult>({
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
