import { request } from '../utils/request';
const STORAGE_KEYS = {
    pendingReferralCode: 'ab_pending_referral_code',
};
function readText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
export function normalizeReferralCode(raw) {
    const text = readText(raw).replace(/^ANBAN_REFERRAL:/i, '');
    if (!text)
        return '';
    const match = text.match(/referralCode=([^&]+)/i);
    const extracted = (match === null || match === void 0 ? void 0 : match[1]) ? decodeURIComponent(match[1]) : text;
    return extracted.trim().toUpperCase();
}
export function getPendingReferralCode() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.pendingReferralCode);
        const normalized = normalizeReferralCode(typeof value === 'string' ? value : '');
        return normalized || null;
    }
    catch {
        return null;
    }
}
export function setPendingReferralCode(code) {
    try {
        const normalized = normalizeReferralCode(code);
        if (!normalized) {
            wx.removeStorageSync(STORAGE_KEYS.pendingReferralCode);
            return;
        }
        wx.setStorageSync(STORAGE_KEYS.pendingReferralCode, normalized);
    }
    catch {
        // ignore
    }
}
export function clearPendingReferralCode() {
    setPendingReferralCode(null);
}
export function capturePendingReferralCode(raw) {
    const normalized = normalizeReferralCode(raw);
    if (!normalized) {
        return null;
    }
    setPendingReferralCode(normalized);
    return normalized;
}
export async function fetchReferralMine() {
    const resp = await request({
        url: '/api/app/referral/me',
        method: 'GET',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '推荐信息加载失败');
    }
    return {
        inviteCode: readText(resp.data.invite_code),
        sharePath: readText(resp.data.share_path),
        qrImageDataUrl: readText(resp.data.qr_image_data_url),
        bound: Boolean(resp.data.bound),
        referrerName: readText(resp.data.referrer_name),
        referrerPhone: readText(resp.data.referrer_phone),
    };
}
export async function bindReferralCode(inviteCode, bindSource = 'manual') {
    const normalized = normalizeReferralCode(inviteCode);
    if (!normalized) {
        throw new Error('请输入有效邀请码');
    }
    const resp = await request({
        url: '/api/app/referral/bind',
        method: 'POST',
        data: {
            invite_code: normalized,
            bind_source: bindSource,
        },
    });
    if (!resp.ok) {
        throw new Error(resp.message || '绑定推荐关系失败');
    }
    return {
        bound: Boolean(resp.data.bound),
        alreadyBound: Boolean(resp.data.already_bound),
        inviteCode: readText(resp.data.invite_code),
        referrerName: readText(resp.data.referrer_name),
        referrerPhone: readText(resp.data.referrer_phone),
    };
}
export async function applyPendingReferral(bindSource = 'share') {
    const pendingCode = getPendingReferralCode();
    if (!pendingCode) {
        return null;
    }
    const result = await bindReferralCode(pendingCode, bindSource);
    if (result.bound || result.alreadyBound) {
        clearPendingReferralCode();
    }
    return result;
}
