import { getAuthState } from '../utils/auth';
import { USER_ROLES } from '../shared/roles';
import { getDeviceList } from './deviceCenter';
import { transferDevice } from './deviceCenter';
import { pushFamilyNotice } from './messageCenter';
import { request } from '../utils/request';
import { FORCE_MOCK } from '../config/mock';
import { refreshSession } from './sessionAuth';
const STORAGE_KEYS = {
    family: 'ab_family',
    members: 'ab_family_members',
};
function uuid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function getFromStorage(key, fallback) {
    var _a;
    try {
        const v = wx.getStorageSync(key);
        return (_a = v) !== null && _a !== void 0 ? _a : fallback;
    }
    catch {
        return fallback;
    }
}
function setToStorage(key, value) {
    try {
        wx.setStorageSync(key, value);
    }
    catch {
        // ignore
    }
}
function canUseBackendFamilyApi() {
    return !FORCE_MOCK && Boolean(getAuthState().token);
}
function mapBackendDevice(item) {
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
function mapBackendProfile(raw) {
    const familyId = String(raw.family_id);
    const families = Array.isArray(raw.families)
        ? raw.families.map((item) => ({
            id: String(item.family_id),
            name: String(item.family_name || '').trim() || (item.owner_name ? `${item.owner_name}的家庭` : '我的家庭'),
            ownerPhone: String(item.owner_phone || '').trim(),
            ownerName: String(item.owner_name || '').trim(),
            role: item.my_role === 'owner' ? 'ADMIN' : 'MEMBER',
            memberCount: Number(item.member_count) || 0,
        }))
        : [];
    const members = raw.members.map((m) => ({
        id: m.user_phone,
        userId: m.user_phone,
        name: m.user_name || m.user_phone,
        phone: m.user_phone,
        role: m.role === 'owner' ? 'ADMIN' : 'MEMBER',
        createdAt: Date.parse(m.joined_at || '') || Date.now(),
    }));
    const family = {
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
function migrateFamily(raw) {
    const adminUserId = String(raw.adminUserId || raw.ownerUserId || '');
    const { ownerUserId: _o, ...rest } = raw;
    return { ...rest, adminUserId };
}
function migrateMember(raw) {
    let role = raw.role;
    if (raw.role === 'OWNER')
        role = 'ADMIN';
    return { ...raw, role };
}
/** 启动时调用：保证本地演示家庭存在（须在设备 seed 之前） */
export function ensureSeedFamily() {
    const st = getAuthState();
    const adminUserId = st.userId || 'u_demo_owner';
    const familyRaw = getFromStorage(STORAGE_KEYS.family, null);
    const membersRaw = getFromStorage(STORAGE_KEYS.members, null);
    if (familyRaw && Array.isArray(membersRaw) && membersRaw.length > 0)
        return;
    const now = Date.now();
    const seedFamily = {
        id: uuid('fam'),
        name: '我的家庭',
        address: '示例地址（可编辑）',
        adminUserId,
        createdAt: now,
        updatedAt: now,
    };
    const seedMembers = [
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
export function getPreferredFamilyId() {
    const family = getFromStorage(STORAGE_KEYS.family, null);
    if (family && typeof family === 'object' && family.id) {
        return String(family.id);
    }
    return null;
}
export function setPreferredFamilyId(familyId) {
    const current = getFromStorage(STORAGE_KEYS.family, null);
    if (!familyId) {
        if (!current || typeof current !== 'object')
            return;
        setToStorage(STORAGE_KEYS.family, { ...current, id: '' });
        return;
    }
    if (current && typeof current === 'object') {
        setToStorage(STORAGE_KEYS.family, { ...current, id: familyId });
        return;
    }
    setToStorage(STORAGE_KEYS.family, { id: familyId });
}
function rememberCurrentFamily(profile) {
    setToStorage(STORAGE_KEYS.family, profile.family);
}
function normalizeBackendFamilyId(familyId) {
    const normalized = String(familyId || '').trim();
    if (!normalized)
        return null;
    return normalized;
}
export function isFamilyAdmin(profile) {
    if (!(profile === null || profile === void 0 ? void 0 : profile.family))
        return false;
    const st = getAuthState();
    const uid = st.userId || '';
    const phone = (st.boundPhone || '').trim();
    const adminId = profile.family.adminUserId || profile.family.ownerUserId || '';
    const me = profile.members.find((m) => {
        if (uid && m.userId === uid)
            return true;
        return Boolean(phone && (m.phone || '').trim() === phone);
    });
    if ((me === null || me === void 0 ? void 0 : me.role) === 'ADMIN')
        return true;
    if (phone && adminId && phone === adminId)
        return true;
    return Boolean(uid && adminId && uid === adminId);
}
export async function getFamilyProfile(_role, familyId) {
    if (canUseBackendFamilyApi()) {
        const targetFamilyId = normalizeBackendFamilyId(familyId || getPreferredFamilyId());
        let resp = await request({
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
                resp = await request({
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
    const family = migrateFamily(getFromStorage(STORAGE_KEYS.family, {}));
    const members = getFromStorage(STORAGE_KEYS.members, []).map(migrateMember);
    const devices = await getDeviceList(USER_ROLES.CUSTOMER);
    const families = [
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
export async function updateFamily(patch) {
    var _a, _b, _c, _d;
    ensureSeedFamily();
    const family = migrateFamily(getFromStorage(STORAGE_KEYS.family, {}));
    const next = {
        ...family,
        name: ((_b = (_a = patch.name) !== null && _a !== void 0 ? _a : family.name) !== null && _b !== void 0 ? _b : '').trim() || '我的家庭',
        address: ((_d = (_c = patch.address) !== null && _c !== void 0 ? _c : family.address) !== null && _d !== void 0 ? _d : '').trim(),
        updatedAt: Date.now(),
    };
    setToStorage(STORAGE_KEYS.family, next);
}
export async function addMember(input) {
    if (canUseBackendFamilyApi()) {
        const phone = (input.phone || '').trim();
        if (!phone)
            throw new Error('请输入成员手机号');
        const resp = await request({
            url: '/api/user/family/members/invite',
            method: 'POST',
            data: { phone },
        });
        if (!resp.ok)
            throw new Error(resp.message || '邀请失败');
        const profile = await getFamilyProfile(USER_ROLES.CUSTOMER);
        const member = profile.members.find((m) => m.phone === phone);
        if (member)
            return member;
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
    if (!name)
        throw new Error('成员姓名不能为空');
    const now = Date.now();
    const newMember = {
        id: uuid('mem'),
        userId: uuid('u'),
        name,
        phone: (input.phone || '').trim(),
        role: 'MEMBER',
        createdAt: now,
    };
    const members = getFromStorage(STORAGE_KEYS.members, []);
    setToStorage(STORAGE_KEYS.members, [newMember, ...members]);
    void pushFamilyNotice({
        title: '家庭成员加入',
        content: `「${name}」已通过邀请加入家庭。`,
    }).catch(() => { });
    return newMember;
}
export async function removeMember(memberId) {
    if (canUseBackendFamilyApi()) {
        const phone = String(memberId || '').trim();
        if (!phone)
            throw new Error('成员手机号缺失');
        const resp = await request({
            url: '/api/user/family/members/remove',
            method: 'POST',
            data: { phone },
        });
        if (!resp.ok)
            throw new Error(resp.message || '删除失败');
        return;
    }
    ensureSeedFamily();
    const members = getFromStorage(STORAGE_KEYS.members, []).map(migrateMember);
    const target = members.find((m) => m.id === memberId);
    if (!target)
        return;
    if (target.role === 'ADMIN')
        throw new Error('不能删除家庭管理员');
    setToStorage(STORAGE_KEYS.members, members.filter((m) => m.id !== memberId));
    void pushFamilyNotice({
        title: '家庭成员移除',
        content: `「${target.name}」已从家庭中移除。`,
    }).catch(() => { });
}
/** 设备台账归属转让（演示）；真实换绑家庭由员工端操作绑定关系 */
export async function transferDeviceAdmin(deviceId, targetMemberUserId) {
    await transferDevice(deviceId, targetMemberUserId);
}
