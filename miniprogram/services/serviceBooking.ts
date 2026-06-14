import { request } from '../utils/request';
import { getServiceBookingStatusMeta } from '../shared/dutyStatus';

type JsonRecord = Record<string, unknown>;

type ServiceBookingResponse = {
  booking_id?: number;
  lead_id?: number;
  user_id?: number;
  phone?: string;
  service_code?: string;
  service_title?: string;
  service_category?: string;
  status?: string;
  status_label?: string;
  status_class?: 'pending' | 'completed' | 'cancelled';
  can_cancel?: boolean;
  location_label?: string;
  assigned_admin_id?: number | null;
  assigned_admin_name?: string | null;
  service_contact?: JsonRecord | null;
  created_at?: string;
} | null;

type ServiceBookingHistoryResponse = {
  items?: ServiceBookingResponse[];
} | null;

type CreateServiceBookingInput = {
  serviceCode: string;
  serviceTitle: string;
  serviceCategory?: string;
  locationLabel?: string;
};

type ServiceContact = {
  roleLabel: string;
  displayName: string;
  phone: string;
  wechat: string;
  actionText: string;
};

export type ServiceBookingStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type ServiceBooking = {
  bookingId: number;
  leadId: number;
  userId: number;
  phone: string;
  serviceCode: string;
  serviceTitle: string;
  serviceCategory: string;
  status: ServiceBookingStatus;
  statusText: string;
  statusClass: 'pending' | 'completed' | 'cancelled';
  canCancel: boolean;
  locationLabel: string;
  assignedAdminId: number | null;
  assignedAdminName: string;
  managerDisplayName: string;
  serviceContact: ServiceContact;
  createdAt: string;
  createdAtText: string;
  statusHint: string;
};

function formatBookingTime(value: string): string {
  const normalized = readString(value);
  if (!normalized) {
    return '';
  }
  const parsed = new Date(normalized.replace(/-/g, '/'));
  if (Number.isNaN(parsed.getTime())) {
    return normalized.replace('T', ' ');
  }
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  const hour = `${parsed.getHours()}`.padStart(2, '0');
  const minute = `${parsed.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function buildStatusHint(status: ServiceBookingStatus, statusText: string, managerDisplayName: string): string {
  if (status === 'COMPLETED') {
    return `当前状态${statusText}，如需再次上门可重新预约。`;
  }
  if (status === 'CANCELLED') {
    return `当前状态${statusText}，你可以重新选择其他时间或服务。`;
  }
  return `当前状态${statusText}，${managerDisplayName || '安伴社区管家'}会尽快与你确认服务时间。`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function mapStatus(
  status: string,
  statusLabel?: string,
  statusClass?: string,
  canCancel?: boolean,
): Pick<ServiceBooking, 'status' | 'statusText' | 'statusClass' | 'canCancel'> {
  const fallback = getServiceBookingStatusMeta(status);
  const normalizedClass = readString(statusClass);
  return {
    status: fallback.status,
    statusText: readString(statusLabel) || fallback.statusText,
    statusClass:
      normalizedClass === 'pending' || normalizedClass === 'completed' || normalizedClass === 'cancelled'
        ? normalizedClass
        : fallback.statusClass,
    canCancel: typeof canCancel === 'boolean' ? canCancel : fallback.canCancel,
  };
}

function normalizeServiceContact(value: unknown): ServiceContact {
  const record = isRecord(value) ? value : {};
  return {
    roleLabel: readString(record.role_label),
    displayName: readString(record.display_name),
    phone: readString(record.phone),
    wechat: readString(record.wechat),
    actionText: readString(record.action_text),
  };
}

function normalizeServiceBooking(value: ServiceBookingResponse): ServiceBooking | null {
  if (!isRecord(value)) {
    return null;
  }
  const statusMeta = mapStatus(
    readString(value.status),
    readString(value.status_label),
    readString(value.status_class),
    typeof value.can_cancel === 'boolean' ? value.can_cancel : undefined,
  );
  const serviceContact = normalizeServiceContact(value.service_contact);
  const assignedAdminName = readString(value.assigned_admin_name);
  const managerDisplayName = assignedAdminName || serviceContact.displayName || '安伴社区管家';
  const createdAt = readString(value.created_at);
  return {
    bookingId: readNumber(value.booking_id),
    leadId: readNumber(value.lead_id),
    userId: readNumber(value.user_id),
    phone: readString(value.phone),
    serviceCode: readString(value.service_code),
    serviceTitle: readString(value.service_title),
    serviceCategory: readString(value.service_category),
    status: statusMeta.status,
    statusText: statusMeta.statusText,
    statusClass: statusMeta.statusClass,
    canCancel: statusMeta.canCancel,
    locationLabel: readString(value.location_label),
    assignedAdminId: value.assigned_admin_id == null ? null : readNumber(value.assigned_admin_id),
    assignedAdminName,
    managerDisplayName,
    serviceContact,
    createdAt,
    createdAtText: formatBookingTime(createdAt),
    statusHint: buildStatusHint(statusMeta.status, statusMeta.statusText, managerDisplayName),
  };
}

export async function getCurrentServiceBooking(): Promise<ServiceBooking | null> {
  const result = await request<ServiceBookingResponse>({
    url: '/api/app/service-bookings/current',
    method: 'GET',
  });
  if (!result.ok) {
    throw new Error(result.message || '加载服务预约失败');
  }
  return normalizeServiceBooking(result.data);
}

export async function createServiceBooking(input: CreateServiceBookingInput): Promise<ServiceBooking> {
  const result = await request<ServiceBookingResponse>({
    url: '/api/app/service-bookings',
    method: 'POST',
    data: input,
  });
  if (!result.ok) {
    throw new Error(result.message || '预约失败');
  }
  const booking = normalizeServiceBooking(result.data);
  if (!booking) {
    throw new Error('预约结果无效');
  }
  return booking;
}

export async function cancelServiceBooking(bookingId: number): Promise<ServiceBooking> {
  const result = await request<ServiceBookingResponse>({
    url: `/api/app/service-bookings/${bookingId}/cancel`,
    method: 'POST',
  });
  if (!result.ok) {
    throw new Error(result.message || '取消失败');
  }
  const booking = normalizeServiceBooking(result.data);
  if (!booking) {
    throw new Error('取消结果无效');
  }
  return booking;
}

export async function listServiceBookings(status?: 'pending' | 'completed' | 'cancelled'): Promise<ServiceBooking[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const result = await request<ServiceBookingHistoryResponse>({
    url: `/api/app/service-bookings/history${query}`,
    method: 'GET',
  });
  if (!result.ok) {
    throw new Error(result.message || '加载服务预约记录失败');
  }
  const payload = result.data;
  const rows = payload && Array.isArray(payload.items) ? payload.items : [];
  return rows
      .map((row) => normalizeServiceBooking(row))
      .filter((row): row is ServiceBooking => !!row);
}
