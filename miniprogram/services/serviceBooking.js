import { request } from '../utils/request';
import { getServiceBookingStatusMeta } from '../shared/dutyStatus';
function formatBookingTime(value) {
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
function buildStatusHint(status, statusText, managerDisplayName) {
    if (status === 'COMPLETED') {
        return `当前状态${statusText}，如需再次上门可重新预约。`;
    }
    if (status === 'CANCELLED') {
        return `当前状态${statusText}，你可以重新选择其他时间或服务。`;
    }
    return `当前状态${statusText}，${managerDisplayName || '安伴社区管家'}会尽快与你确认服务时间。`;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function mapStatus(status, statusLabel, statusClass, canCancel) {
    const fallback = getServiceBookingStatusMeta(status);
    const normalizedClass = readString(statusClass);
    return {
        status: fallback.status,
        statusText: readString(statusLabel) || fallback.statusText,
        statusClass: normalizedClass === 'pending' || normalizedClass === 'completed' || normalizedClass === 'cancelled'
            ? normalizedClass
            : fallback.statusClass,
        canCancel: typeof canCancel === 'boolean' ? canCancel : fallback.canCancel,
    };
}
function normalizeServiceContact(value) {
    const record = isRecord(value) ? value : {};
    return {
        roleLabel: readString(record.role_label),
        displayName: readString(record.display_name),
        phone: readString(record.phone),
        wechat: readString(record.wechat),
        actionText: readString(record.action_text),
    };
}
function normalizeServiceBooking(value) {
    if (!isRecord(value)) {
        return null;
    }
    const statusMeta = mapStatus(readString(value.status), readString(value.status_label), readString(value.status_class), typeof value.can_cancel === 'boolean' ? value.can_cancel : undefined);
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
export async function getCurrentServiceBooking() {
    const result = await request({
        url: '/api/app/service-bookings/current',
        method: 'GET',
    });
    if (!result.ok) {
        throw new Error(result.message || '加载服务预约失败');
    }
    return normalizeServiceBooking(result.data);
}
export async function createServiceBooking(input) {
    const result = await request({
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
export async function cancelServiceBooking(bookingId) {
    const result = await request({
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
export async function listServiceBookings(status) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const result = await request({
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
        .filter((row) => !!row);
}
