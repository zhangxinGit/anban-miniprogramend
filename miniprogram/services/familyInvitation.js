import { request } from '../utils/request';
import { setPreferredFamilyId } from './familyProfile';
const STORAGE_KEYS = {
    pendingInviteToken: 'ab_family_invite_token',
};
export function buildFamilyInvitePath(token) {
    return `/pages/family-invite/index?token=${encodeURIComponent(token)}`;
}
export function getPendingFamilyInviteToken() {
    try {
        const value = wx.getStorageSync(STORAGE_KEYS.pendingInviteToken);
        return typeof value === 'string' && value ? value : null;
    }
    catch {
        return null;
    }
}
export function setPendingFamilyInviteToken(token) {
    try {
        if (!token)
            wx.removeStorageSync(STORAGE_KEYS.pendingInviteToken);
        else
            wx.setStorageSync(STORAGE_KEYS.pendingInviteToken, token);
    }
    catch {
        // ignore
    }
}
export function clearPendingFamilyInviteToken() {
    setPendingFamilyInviteToken(null);
}
export function getPendingFamilyInviteUrl() {
    const token = getPendingFamilyInviteToken();
    return token ? buildFamilyInvitePath(token) : null;
}
export async function createFamilyInvite() {
    const resp = await request({
        url: '/api/app/family/invitations',
        method: 'POST',
    });
    if (!resp.ok)
        throw new Error(resp.message || '生成邀请链接失败');
    const token = String(resp.data.invite_token || '').trim();
    if (!token)
        throw new Error('邀请链接生成失败');
    return {
        token,
        path: buildFamilyInvitePath(token),
        ownerName: String(resp.data.owner_name || '').trim(),
        expiresAt: String(resp.data.expires_at || '').trim(),
    };
}
export async function previewFamilyInvite(token) {
    const resp = await request({
        url: `/api/app/family/invitations/preview?token=${encodeURIComponent(token)}`,
        method: 'GET',
    });
    if (!resp.ok)
        throw new Error(resp.message || '邀请链接无效');
    return {
        familyId: String(resp.data.family_id),
        ownerName: String(resp.data.owner_name || '').trim(),
        ownerPhone: String(resp.data.owner_phone || '').trim(),
        memberCount: Number(resp.data.member_count) || 0,
        expiresAt: String(resp.data.expires_at || '').trim(),
    };
}
export async function acceptFamilyInvite(token) {
    const resp = await request({
        url: '/api/app/family/invitations/accept',
        method: 'POST',
        data: { token },
    });
    if (!resp.ok)
        throw new Error(resp.message || '加入家庭失败');
    const result = {
        familyId: String(resp.data.family_id),
        ownerName: String(resp.data.owner_name || '').trim(),
        alreadyJoined: Boolean(resp.data.already_joined),
    };
    setPreferredFamilyId(result.familyId);
    const pending = getPendingFamilyInviteToken();
    if (pending && pending === token) {
        clearPendingFamilyInviteToken();
    }
    return result;
}
