import { request } from '../utils/request';
import { setPreferredFamilyId } from './familyProfile';

const STORAGE_KEYS = {
  pendingInviteToken: 'ab_family_invite_token',
} as const;

type BackendInviteIssue = {
  invite_token: string;
  family_id: number;
  owner_name: string;
  expires_at: string;
};

type BackendInvitePreview = {
  family_id: number;
  owner_name: string;
  owner_phone: string;
  member_count: number;
  expires_at: string;
};

type BackendInviteAccept = {
  family_id: number;
  owner_name: string;
  already_joined: boolean;
};

export type FamilyInviteShare = {
  token: string;
  path: string;
  ownerName: string;
  expiresAt: string;
};

export type FamilyInvitePreview = {
  familyId: string;
  ownerName: string;
  ownerPhone: string;
  memberCount: number;
  expiresAt: string;
};

export type FamilyInviteAccept = {
  familyId: string;
  ownerName: string;
  alreadyJoined: boolean;
};

export function buildFamilyInvitePath(token: string): string {
  return `/pages/family-invite/index?token=${encodeURIComponent(token)}`;
}

export function getPendingFamilyInviteToken(): string | null {
  try {
    const value = wx.getStorageSync(STORAGE_KEYS.pendingInviteToken);
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

export function setPendingFamilyInviteToken(token: string | null) {
  try {
    if (!token) wx.removeStorageSync(STORAGE_KEYS.pendingInviteToken);
    else wx.setStorageSync(STORAGE_KEYS.pendingInviteToken, token);
  } catch {
    // ignore
  }
}

export function clearPendingFamilyInviteToken() {
  setPendingFamilyInviteToken(null);
}

export function getPendingFamilyInviteUrl(): string | null {
  const token = getPendingFamilyInviteToken();
  return token ? buildFamilyInvitePath(token) : null;
}

export async function createFamilyInvite(): Promise<FamilyInviteShare> {
  const resp = await request<BackendInviteIssue>({
    url: '/api/app/family/invitations',
    method: 'POST',
  });
  if (!resp.ok) throw new Error(resp.message || '生成邀请链接失败');

  const token = String(resp.data.invite_token || '').trim();
  if (!token) throw new Error('邀请链接生成失败');
  return {
    token,
    path: buildFamilyInvitePath(token),
    ownerName: String(resp.data.owner_name || '').trim(),
    expiresAt: String(resp.data.expires_at || '').trim(),
  };
}

export async function previewFamilyInvite(token: string): Promise<FamilyInvitePreview> {
  const resp = await request<BackendInvitePreview>({
    url: `/api/app/family/invitations/preview?token=${encodeURIComponent(token)}`,
    method: 'GET',
  });
  if (!resp.ok) throw new Error(resp.message || '邀请链接无效');

  return {
    familyId: String(resp.data.family_id),
    ownerName: String(resp.data.owner_name || '').trim(),
    ownerPhone: String(resp.data.owner_phone || '').trim(),
    memberCount: Number(resp.data.member_count) || 0,
    expiresAt: String(resp.data.expires_at || '').trim(),
  };
}

export async function acceptFamilyInvite(token: string): Promise<FamilyInviteAccept> {
  const resp = await request<BackendInviteAccept>({
    url: '/api/app/family/invitations/accept',
    method: 'POST',
    data: { token },
  });
  if (!resp.ok) throw new Error(resp.message || '加入家庭失败');

  const result: FamilyInviteAccept = {
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