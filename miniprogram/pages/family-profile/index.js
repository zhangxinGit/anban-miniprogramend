import { roleStore } from '../../store/roleStore';
import { getFamilyProfile, isFamilyAdmin, removeMember, setPreferredFamilyId, } from '../../services/familyProfile';
import { createFamilyInvite } from '../../services/familyInvitation';
import { showAppModal } from '../../utils/modal';
import { getErrorMessage } from '../../utils/errorMessage';
const INVITE_EXPIRING_SOON_MS = 15000;
const EMPTY_FAMILY = {
    id: '',
    name: '',
    address: '',
    adminUserId: '',
    createdAt: 0,
    updatedAt: 0,
};
function formatInviteExpireLabel(expiresAt) {
    const ts = Date.parse(expiresAt || '');
    if (!Number.isFinite(ts))
        return '24小时内有效';
    const date = new Date(ts);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi} 前有效`;
}
Page({
    data: {
        loading: true,
        error: '',
        role: roleStore.getState().role,
        isFamilyAdmin: false,
        family: EMPTY_FAMILY,
        families: [],
        selectedFamilyId: '',
        members: [],
        devices: [],
        visible: {
            addMember: false,
            removeMember: false,
            editFamily: false,
            transferDeviceAdmin: false,
        },
        inviteLoading: false,
        inviteReady: false,
        inviteSharePath: '',
        inviteExpiresAt: '',
        inviteExpiresLabel: '',
    },
    _inviteTimer: 0,
    _requestedFamilyId: '',
    onLoad(query) {
        const page = this;
        this._requestedFamilyId = String((query === null || query === void 0 ? void 0 : query.familyId) || '').trim();
        page.__unsub = roleStore.subscribe((role) => {
            this.setData({ role });
            this.refreshVisible(null);
            this.reload();
        });
        this.refreshVisible(null);
        this.reload();
    },
    onUnload() {
        const page = this;
        const u = page.__unsub;
        if (typeof u === 'function')
            u();
        this.clearInviteTimer();
    },
    onShow() {
        this.refreshInviteStatus();
        this.scheduleInviteExpiryRefresh();
    },
    onShareAppMessage() {
        var _a;
        return {
            title: ((_a = this.data.family) === null || _a === void 0 ? void 0 : _a.name) ? `邀请你加入${this.data.family.name}` : '邀请您加入家庭',
            path: this.data.inviteSharePath || '/pages/mine/index',
        };
    },
    refreshVisible(profile) {
        const admin = isFamilyAdmin(profile);
        this.setData({
            isFamilyAdmin: admin,
            visible: {
                addMember: admin,
                removeMember: admin,
                editFamily: false,
                transferDeviceAdmin: false,
            },
            inviteReady: admin ? this.data.inviteReady : false,
            inviteSharePath: admin ? this.data.inviteSharePath : '',
            inviteExpiresAt: admin ? this.data.inviteExpiresAt : '',
            inviteExpiresLabel: admin ? this.data.inviteExpiresLabel : '',
        });
    },
    isInviteStillValid() {
        const ts = Date.parse(this.data.inviteExpiresAt || '');
        return Number.isFinite(ts) && ts - Date.now() > INVITE_EXPIRING_SOON_MS;
    },
    refreshInviteStatus() {
        if (this.data.inviteReady && !this.isInviteStillValid()) {
            this.clearInviteTimer();
            this.setData({
                inviteReady: false,
                inviteSharePath: '',
                inviteExpiresAt: '',
                inviteExpiresLabel: '',
            });
        }
    },
    clearInviteTimer() {
        if (this._inviteTimer) {
            clearTimeout(this._inviteTimer);
            this._inviteTimer = 0;
        }
    },
    scheduleInviteExpiryRefresh() {
        this.clearInviteTimer();
        if (!this.data.inviteReady)
            return;
        const ts = Date.parse(this.data.inviteExpiresAt || '');
        if (!Number.isFinite(ts))
            return;
        const delay = Math.max(0, ts - Date.now() + 500);
        const timer = setTimeout(() => {
            this._inviteTimer = 0;
            this.refreshInviteStatus();
        }, delay);
        this._inviteTimer = timer;
    },
    async onCreateInviteShare() {
        if (!this.data.visible.addMember) {
            this.setData({ inviteLoading: false, inviteReady: false, inviteSharePath: '', inviteExpiresAt: '', inviteExpiresLabel: '' });
            return;
        }
        this.setData({ inviteLoading: true, inviteReady: false, inviteSharePath: '', inviteExpiresAt: '', inviteExpiresLabel: '' });
        try {
            const invite = await createFamilyInvite();
            this.setData({
                inviteLoading: false,
                inviteReady: true,
                inviteSharePath: invite.path,
                inviteExpiresAt: invite.expiresAt,
                inviteExpiresLabel: formatInviteExpireLabel(invite.expiresAt),
            });
            this.scheduleInviteExpiryRefresh();
            wx.showToast({ title: '本次分享链接已生成', icon: 'success' });
        }
        catch (error) {
            this.setData({ inviteLoading: false, inviteReady: false, inviteSharePath: '', inviteExpiresAt: '', inviteExpiresLabel: '' });
            wx.showToast({ title: getErrorMessage(error, '邀请链接生成失败'), icon: 'none' });
        }
    },
    async reload() {
        this.setData({ loading: true, error: '' });
        try {
            const targetFamilyId = this._requestedFamilyId || this.data.selectedFamilyId || '';
            const profile = await getFamilyProfile(this.data.role, targetFamilyId);
            this._requestedFamilyId = profile.family.id;
            setPreferredFamilyId(profile.family.id);
            this.refreshVisible(profile);
            this.setData({
                loading: false,
                family: profile.family,
                families: profile.families,
                selectedFamilyId: profile.family.id,
                members: profile.members,
                devices: profile.devices,
            });
            this.refreshInviteStatus();
        }
        catch (error) {
            this.setData({
                loading: false,
                error: getErrorMessage(error, '加载失败'),
                inviteLoading: false,
                inviteReady: false,
                inviteSharePath: '',
                inviteExpiresAt: '',
                inviteExpiresLabel: '',
            });
        }
    },
    onRetry() {
        this.reload();
    },
    onSwitchFamily(e) {
        var _a, _b, _c;
        const familyId = String((_c = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : '').trim();
        if (!familyId || familyId === this.data.selectedFamilyId || this.data.loading)
            return;
        this._requestedFamilyId = familyId;
        void this.reload();
    },
    onRemoveMember(e) {
        var _a, _b, _c, _d;
        const id = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        const name = String(((_d = (_c = e.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.name) || '该成员');
        if (!id)
            return;
        showAppModal({
            title: '删除成员',
            content: `确定删除「${name}」吗？该操作不可恢复。`,
            confirmText: '删除',
            tone: 'danger',
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await removeMember(String(id));
                    wx.showToast({ title: '已删除', icon: 'success' });
                    await this.reload();
                }
                catch (error) {
                    wx.showToast({ title: getErrorMessage(error, '删除失败'), icon: 'none' });
                }
            },
        });
    },
});
