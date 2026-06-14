import { getAuthState } from '../utils/auth';
import { USER_ROLES, type UserRole } from '../shared/roles';
import { getDeviceList, type Device } from './deviceCenter';
import { transferDevice } from './deviceCenter';
import { pushFamilyNotice } from './messageCenter';
import { request } from '../utils/request';
import { FORCE_MOCK } from '../config/mock';
import { refreshSession } from './sessionAuth';

export type Family = {
  id: string;
  name: string;
  address?: string;
  /** 家庭管理员 userId（后台指定或首个绑定设备的用户） */
  adminUserId: string;
  /** @deprecated 旧字段，读取时迁移到 adminUserId */
  ownerUserId?: string;
  createdAt: number;
  updatedAt: number;
};

/** 家庭内权限：仅 ADMIN 可邀请/移除成员 */
export type FamilyMemberRole = 'ADMIN' | 'MEMBER';

export type FamilyMember = {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  role: FamilyMemberRole;
  createdAt: number;
};

export type FamilyGroup = {
  id: string;
  name: string;
  ownerPhone: string;
  ownerName: string;
  role: FamilyMemberRole;
  memberCount: number;
};

export type FamilyProfile = {
  family: Family;
  families: FamilyGroup[];
  members: FamilyMember[];
  devices: Device[];
};

const STORAGE_KEYS = {
  family: 'ab_family',
  members: 'ab_family_members',
} as const;

type BackendFamilyProfile = {
  family_id: number;
  selected_family_id: number;
  owner_phone: string;
  owner_name: string;
  my_role: 'owner' | 'member';
  families: Array<{
    family_id: number;
    family_name: string;
    owner_phone: string;
    owner_name: string;
    my_role: 'owner' | 'member';
    member_count: number;
  }>;
  members: Array<{
    user_phone: string;
    user_name: string;
    role: 'owner' | 'member';
    joined_at: string;
  }>;
  devices: Array<{
    device_id: number;
    device_sn: string;
    status?: string;
    online?: number;
    install_location?: string;
  }>;
};

function uuid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getFromStorage<T>(key: string, fallback: T): T {
  try {
    const v = wx.getStorageSync(key);
    return (v as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function setToStorage(key: string, value: any) {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // ignore
  }
}

function canUseBackendFamilyApi(): boolean {
  return !FORCE_MOCK && Boolean(getAuthState().token);
}

function mapBackendDevice(item: BackendFamilyProfile['devices'][number]): Device {
  const sn = String(item.device_sn || '').trim();
  return {
    id: String(item.device_id),
    displayName: sn ? `安伴设备 ${sn.slice(-4)}` : '安伴设备',
    name: sn ? `安伴设备 ${sn.slice(-4)}` : '安伴设备',
    model: 'AB-GW-01',
    sn,
    installLocation: String(item.install_location || '').trim(),
    ownerUserId: '',
    online: item.online === 1 ? 'ONLINE' : 'OFFLINE',
    battery: { percent: 100, charging: false },
    alarm: { unreadCount: 0 },
    lastSeenAt: Date.now(),
    currentFamilyId: null,
    familyBindings: [],
  };
}

function mapBackendProfile(raw: BackendFamilyProfile): FamilyProfile {
  const familyId = String(raw.family_id);
  const families: FamilyGroup[] = Array.isArray(raw.families)
    ? raw.families.map((item) => ({
        id: String(item.family_id),
        name: String(item.family_name || '').trim() || (item.owner_name ? `${item.owner_name}的家庭` : '我的家庭'),
        ownerPhone: String(item.owner_phone || '').trim(),
        ownerName: String(item.owner_name || '').trim(),
        role: item.my_role === 'owner' ? 'ADMIN' : 'MEMBER',
        memberCount: Number(item.member_count) || 0,
      }))
    : [];
  const members: FamilyMember[] = raw.members.map((m) => ({
    id: m.user_phone,
    userId: m.user_phone,
    name: m.user_name || m.user_phone,
    phone: m.user_phone,
    role: m.role === 'owner' ? 'ADMIN' : 'MEMBER',
    createdAt: Date.parse(m.joined_at || '') || Date.now(),
  }));

  const family: Family = {
    id: familyId,
    name: raw.owner_name ? `${raw.owner_name}的家庭` : '我的家庭',
    address: '',
    adminUserId: raw.owner_phone,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const devices = raw.devices.map(mapBackendDevice).map((d) => ({
    ...d,
    currentFamilyId: familyId,
    familyBindings: [{ familyId, active: true, boundAt: Date.now() }],
  }));

  return { family, families, members, devices };
}

function migrateFamily(raw: any): Family {
  const adminUserId = String(raw.adminUserId || raw.ownerUserId || '');
  const { ownerUserId: _o, ...rest } = raw;
  return { ...rest, adminUserId };
}

function migrateMember(raw: any): FamilyMember {
  let role = raw.role as FamilyMemberRole;
  if (raw.role === 'OWNER') role = 'ADMIN';
  return { ...raw, role };
}

/** 启动时调用：保证本地演示家庭存在（须在设备 seed 之前） */
export function ensureSeedFamily() {
  const st = getAuthState();
  const adminUserId = st.userId || 'u_demo_owner';

  const familyRaw = getFromStorage<any | null>(STORAGE_KEYS.family, null);
  const membersRaw = getFromStorage<any[] | null>(STORAGE_KEYS.members, null);
  if (familyRaw && Array.isArray(membersRaw) && membersRaw.length > 0) return;

  const now = Date.now();
  const seedFamily: Family = {
    id: uuid('fam'),
    name: '我的家庭',
    address: '示例地址（可编辑）',
    adminUserId,
    createdAt: now,
    updatedAt: now,
  };

  const seedMembers: FamilyMember[] = [
    {
      id: uuid('mem'),
      userId: adminUserId,
      name: '家庭管理员',
      phone: '',
      role: 'ADMIN',
      createdAt: now,
    },
    {
      id: uuid('mem'),
      userId: 'u_other',
      name: '家庭成员',
      phone: '',
      role: 'MEMBER',
      createdAt: now,
    },
  ];

  setToStorage(STORAGE_KEYS.family, seedFamily);
  setToStorage(STORAGE_KEYS.members, seedMembers);
}

export function getPreferredFamilyId(): string | null {
  const family = getFromStorage<any | null>(STORAGE_KEYS.family, null);
  if (family && typeof family === 'object' && family.id) {
    return String(family.id);
  }
  return null;
}

export function setPreferredFamilyId(familyId: string | null) {
  const current = getFromStorage<any | null>(STORAGE_KEYS.family, null);
  if (!familyId) {
    if (!current || typeof current !== 'object') return;
    setToStorage(STORAGE_KEYS.family, { ...current, id: '' });
    return;
  }
  if (current && typeof current === 'object') {
    setToStorage(STORAGE_KEYS.family, { ...current, id: familyId });
    return;
  }
  setToStorage(STORAGE_KEYS.family, { id: familyId });
}

function rememberCurrentFamily(profile: FamilyProfile) {
  setToStorage(STORAGE_KEYS.family, profile.family);
}

function normalizeBackendFamilyId(familyId: string | null | undefined): string | null {
  const normalized = String(familyId || '').trim();
  if (!normalized) return null;
  return normalized;
}

export function isFamilyAdmin(profile: FamilyProfile | null): boolean {
  if (!profile?.family) return false;
  const st = getAuthState();
  const uid = st.userId || '';
  const phone = (st.boundPhone || '').trim();
  const adminId = profile.family.adminUserId || profile.family.ownerUserId || '';
  const me = profile.members.find((m) => {
    if (uid && m.userId === uid) return true;
    return Boolean(phone && (m.phone || '').trim() === phone);
  });
  if (me?.role === 'ADMIN') return true;
  if (phone && adminId && phone === adminId) return true;
  return Boolean(uid && adminId && uid === adminId);
}

export async function getFamilyProfile(_role: UserRole, familyId?: string): Promise<FamilyProfile> {
  if (canUseBackendFamilyApi()) {
    const targetFamilyId = normalizeBackendFamilyId(familyId || getPreferredFamilyId());
    let resp = await request<BackendFamilyProfile>({
      url: targetFamilyId
        ? `/api/user/family/profile?familyId=${encodeURIComponent(targetFamilyId)}`
        : '/api/user/family/profile',
      method: 'GET',
    });

    // Token 过期自动刷新后重试一次
    if (!resp.ok && (resp.code === 401 || resp.code === 403 || resp.code === '401' || resp.code === '403' || resp.code === 40002 || resp.code === 40300)) {
      console.warn('[getFamilyProfile] 收到 401/403，尝试刷新 token 后重试...');
      const refreshed = await refreshSession(true);
      if (refreshed) {
        resp = await request<BackendFamilyProfile>({
          url: targetFamilyId
            ? `/api/user/family/profile?familyId=${encodeURIComponent(targetFamilyId)}`
            : '/api/user/family/profile',
          method: 'GET',
        });
      }
    }

    if (!resp.ok) {
      console.error('[getFamilyProfile] 请求失败:', resp.message, 'code:', resp.code);
      throw new Error(resp.message || '加载家庭档案失败');
    }
    const profile = mapBackendProfile(resp.data);
    rememberCurrentFamily(profile);
    return profile;
  }

  ensureSeedFamily();
  const family = migrateFamily(getFromStorage<any>(STORAGE_KEYS.family, {} as any));
  const members = getFromStorage<any[]>(STORAGE_KEYS.members, []).map(migrateMember);
  const devices = await getDeviceList(USER_ROLES.CUSTOMER);
  const families: FamilyGroup[] = [
    {
      id: family.id,
      name: family.name,
      ownerPhone: family.adminUserId,
      ownerName: family.name.replace(/的家庭$/, ''),
      role: 'ADMIN',
      memberCount: members.length,
    },
  ];
  return { family, families, members, devices };
}

export async function updateFamily(patch: Partial<Pick<Family, 'name' | 'address'>>): Promise<void> {
  ensureSeedFamily();
  const family = migrateFamily(getFromStorage<any>(STORAGE_KEYS.family, {} as any));
  const next: Family = {
    ...family,
    name: (patch.name ?? family.name ?? '').trim() || '我的家庭',
    address: (patch.address ?? family.address ?? '').trim(),
    updatedAt: Date.now(),
  };
  setToStorage(STORAGE_KEYS.family, next);
}

export async function addMember(input: { name: string; phone?: string }): Promise<FamilyMember> {
  if (canUseBackendFamilyApi()) {
    const phone = (input.phone || '').trim();
    if (!phone) throw new Error('请输入成员手机号');
    const resp = await request<null>({
      url: '/api/user/family/members/invite',
      method: 'POST',
      data: { phone },
    });
    if (!resp.ok) throw new Error(resp.message || '邀请失败');

    const profile = await getFamilyProfile(USER_ROLES.CUSTOMER);
    const member = profile.members.find((m) => m.phone === phone);
    if (member) return member;
    return {
      id: phone,
      userId: phone,
      name: input.name || phone,
      phone,
      role: 'MEMBER',
      createdAt: Date.now(),
    };
  }

  ensureSeedFamily();
  const name = input.name.trim();
  if (!name) throw new Error('成员姓名不能为空');

  const now = Date.now();
  const newMember: FamilyMember = {
    id: uuid('mem'),
    userId: uuid('u'),
    name,
    phone: (input.phone || '').trim(),
    role: 'MEMBER',
    createdAt: now,
  };

  const members = getFromStorage<FamilyMember[]>(STORAGE_KEYS.members, []);
  setToStorage(STORAGE_KEYS.members, [newMember, ...members]);
  void pushFamilyNotice({
    title: '家庭成员加入',
    content: `「${name}」已通过邀请加入家庭。`,
  }).catch(() => {});
  return newMember;
}

export async function removeMember(memberId: string): Promise<void> {
  if (canUseBackendFamilyApi()) {
    const phone = String(memberId || '').trim();
    if (!phone) throw new Error('成员手机号缺失');
    const resp = await request<null>({
      url: '/api/user/family/members/remove',
      method: 'POST',
      data: { phone },
    });
    if (!resp.ok) throw new Error(resp.message || '删除失败');
    return;
  }

  ensureSeedFamily();
  const members = getFromStorage<any[]>(STORAGE_KEYS.members, []).map(migrateMember);
  const target = members.find((m) => m.id === memberId);
  if (!target) return;
  if (target.role === 'ADMIN') throw new Error('不能删除家庭管理员');
  setToStorage(
    STORAGE_KEYS.members,
    members.filter((m) => m.id !== memberId),
  );
  void pushFamilyNotice({
    title: '家庭成员移除',
    content: `「${target.name}」已从家庭中移除。`,
  }).catch(() => {});
}

/** 设备台账归属转让（演示）；真实换绑家庭由员工端操作绑定关系 */
export async function transferDeviceAdmin(deviceId: string, targetMemberUserId: string): Promise<void> {
  await transferDevice(deviceId, targetMemberUserId);
}
