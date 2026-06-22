import { getAuthState } from '../utils/auth';
import { isLoggedIn } from '../utils/auth';
import { request } from '../utils/request';
const STORAGE_KEYS = {
    lastContact: 'ab_appt_last_contact',
    guestAppointment: 'ab_appt_guest_current',
};
function parseFamilyAddress(raw) {
    const normalized = String(raw || '').trim();
    if (!normalized) {
        return { familyAddress: '', detailAddressPrefix: '' };
    }
    const parts = normalized
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length >= 4) {
        return {
            familyAddress: parts.slice(0, 3).join('/'),
            detailAddressPrefix: parts.slice(3).join(''),
        };
    }
    return {
        familyAddress: normalized,
        detailAddressPrefix: '',
    };
}
function mergeDetailAddress(prefix, doorplate) {
    const prefixValue = String(prefix || '').trim();
    const detailValue = String(doorplate || '').trim();
    if (!prefixValue)
        return detailValue;
    if (!detailValue)
        return prefixValue;
    if (detailValue.startsWith(prefixValue))
        return detailValue;
    return `${prefixValue}${detailValue}`;
}
function parseDateTime(value) {
    if (!value)
        return Date.now();
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
}
function mapBackendAppointment(item) {
    const address = parseFamilyAddress(item.family_address);
    return {
        id: String(item.lead_id),
        leadId: String(item.lead_id),
        userId: String(getAuthState().userId || ''),
        name: String(item.name || '').trim(),
        phone: String(item.phone || '').trim(),
        familyAddress: address.familyAddress,
        doorplate: mergeDetailAddress(address.detailAddressPrefix, item.doorplate),
        date: String(item.reserve_date || '').trim(),
        time: String(item.reserve_time_range || '').trim(),
        remark: String(item.remark || '').trim(),
        status: item.status,
        createdAt: parseDateTime(item.created_at),
        updatedAt: parseDateTime(item.updated_at),
    };
}
export function getLastContact() {
    try {
        const v = wx.getStorageSync(STORAGE_KEYS.lastContact);
        if (v && typeof v === 'object') {
            const name = typeof v.name === 'string' ? v.name : '';
            const phone = typeof v.phone === 'string' ? v.phone : '';
            const familyAddress = typeof v.familyAddress === 'string' ? v.familyAddress : '';
            const doorplate = typeof v.doorplate === 'string' ? v.doorplate : '';
            return { name, phone, familyAddress, doorplate };
        }
    }
    catch {
        // ignore
    }
    return { name: '', phone: '', familyAddress: '', doorplate: '' };
}
function setLastContact(name, phone, familyAddress, doorplate) {
    try {
        wx.setStorageSync(STORAGE_KEYS.lastContact, { name, phone, familyAddress, doorplate });
    }
    catch {
        // ignore
    }
}
function getGuestAppointment() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.guestAppointment);
        if (!value || typeof value !== 'object') {
            return null;
        }
        const record = value;
        if (typeof record.id !== 'string' || typeof record.status !== 'string') {
            return null;
        }
        return {
            id: record.id,
            leadId: typeof record.leadId === 'string' ? record.leadId : '',
            userId: typeof record.userId === 'string' ? record.userId : '',
            name: typeof record.name === 'string' ? record.name : '',
            phone: typeof record.phone === 'string' ? record.phone : '',
            familyAddress: typeof record.familyAddress === 'string' ? record.familyAddress : '',
            doorplate: typeof record.doorplate === 'string' ? record.doorplate : '',
            date: typeof record.date === 'string' ? record.date : '',
            time: typeof record.time === 'string' ? record.time : '',
            remark: typeof record.remark === 'string' ? record.remark : '',
            status: record.status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
            createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
            updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
        };
    }
    catch {
        return null;
    }
}
function setGuestAppointment(appointment) {
    try {
        if (!appointment) {
            wx.removeStorageSync(STORAGE_KEYS.guestAppointment);
            return;
        }
        wx.setStorageSync(STORAGE_KEYS.guestAppointment, appointment);
    }
    catch {
        // ignore
    }
}
export async function getAppointment(role) {
    void role;
    const st = getAuthState();
    if (!isLoggedIn())
        return getGuestAppointment();
    if (!st.userId)
        return null;
    const resp = await request({
        url: '/api/app/appointments/current',
        method: 'GET',
    });
    if (!resp.ok)
        throw new Error(resp.message || '加载预约失败');
    if (!resp.data)
        return null;
    return mapBackendAppointment(resp.data);
}
export async function submitAppointment(role, input) {
    void role;
    const payload = {
        name: input.name,
        phone: input.phone,
        familyAddress: input.familyAddress,
        doorplate: input.doorplate,
        reserveDate: input.date,
        reserveTimeRange: input.time,
        remark: input.remark,
        serviceTitle: String(input.serviceName || '').trim(),
        serviceCategory: String(input.serviceCategory || '').trim(),
        sceneTitle: String(input.sceneTitle || '').trim(),
    };
    if (!isLoggedIn()) {
        const resp = await request({
            url: '/api/app/appointments/guest-upsert',
            method: 'POST',
            data: payload,
        });
        if (!resp.ok)
            throw new Error(resp.message || '提交预约失败');
        const appointment = mapBackendAppointment(resp.data);
        setLastContact(appointment.name, appointment.phone, appointment.familyAddress, appointment.doorplate);
        setGuestAppointment(appointment);
        return appointment;
    }
    const resp = await request({
        url: '/api/app/appointments/upsert',
        method: 'POST',
        data: payload,
    });
    if (!resp.ok)
        throw new Error(resp.message || '提交预约失败');
    const appointment = mapBackendAppointment(resp.data);
    setLastContact(appointment.name, appointment.phone, appointment.familyAddress, appointment.doorplate);
    return appointment;
}
export async function cancelAppointment(role) {
    void role;
    if (!isLoggedIn()) {
        const current = getGuestAppointment();
        if (!current) {
            return;
        }
        const leadId = Number(current.leadId || current.id || 0);
        if (Number.isFinite(leadId) && leadId > 0) {
            const resp = await request({
                url: '/api/app/appointments/guest-cancel',
                method: 'POST',
                data: {
                    leadId,
                    phone: current.phone,
                },
            });
            if (!resp.ok)
                throw new Error(resp.message || '取消预约失败');
        }
        setGuestAppointment({
            ...current,
            status: 'CANCELLED',
            updatedAt: Date.now(),
        });
        return;
    }
    const resp = await request({
        url: '/api/app/appointments/cancel',
        method: 'POST',
    });
    if (!resp.ok)
        throw new Error(resp.message || '取消预约失败');
}
