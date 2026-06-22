import { getBoundPhone, getToken } from '../../utils/auth';
import { acceptFamilyInvite, clearPendingFamilyInviteToken, previewFamilyInvite, setPendingFamilyInviteToken, } from '../../services/familyInvitation';
import { maskPhone } from '../../utils/phone';
function canAutoAccept() {
    return Boolean(getToken()) && Boolean((getBoundPhone() || '').trim());
}
function resolveInviteErrorView(message) {
    const text = String(message || '').trim();
    if (text.includes('已过期')) {
        return {
            title: '邀请链接已过期',
            detail: '该邀请链接已超过有效期，请让家庭管理员重新发送新的邀请链接。',
        };
    }
    if (text.includes('已被使用')) {
        return {
            title: '邀请链接已被使用',
            detail: '该邀请链接已经完成过入家操作，不能再次使用。',
        };
    }
    if (text.includes('最新邀请链接') || text.includes('已失效')) {
        return {
            title: '邀请链接已失效',
            detail: '家庭管理员已生成新的邀请链接，请让对方重新分享最新链接。',
        };
    }
    return {
        title: '邀请链接无效',
        detail: text || '当前邀请链接无法识别，请重新获取后再试。',
    };
}
Page({
    data: {
        loading: true,
        acting: false,
        token: '',
        error: '',
        errorTitle: '',
        errorDetail: '',
        needLogin: false,
        accepted: false,
        acceptedText: '',
        preview: null,
    },
    onLoad(query) {
        const token = decodeURIComponent(String((query === null || query === void 0 ? void 0 : query.token) || '')).trim();
        if (!token) {
            clearPendingFamilyInviteToken();
            const view = resolveInviteErrorView('邀请链接无效');
            this.setData({ loading: false, error: '邀请链接无效', errorTitle: view.title, errorDetail: view.detail });
            return;
        }
        setPendingFamilyInviteToken(token);
        this.setData({ token });
        this.reload();
    },
    onShow() {
        if (this.data.token && !this.data.accepted && !this.data.acting && canAutoAccept()) {
            void this.tryAccept();
        }
    },
    async reload() {
        if (!this.data.token)
            return;
        this.setData({ loading: true, error: '', errorTitle: '', errorDetail: '' });
        try {
            const preview = await previewFamilyInvite(this.data.token);
            this.setData({
                loading: false,
                preview: {
                    ...preview,
                    ownerPhoneMask: maskPhone(preview.ownerPhone || '', '—'),
                },
                needLogin: !canAutoAccept(),
            });
            if (canAutoAccept()) {
                await this.tryAccept();
            }
        }
        catch (e) {
            const message = typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '邀请链接无效';
            const view = resolveInviteErrorView(message);
            clearPendingFamilyInviteToken();
            this.setData({
                loading: false,
                error: message,
                errorTitle: view.title,
                errorDetail: view.detail,
                needLogin: false,
            });
        }
    },
    async tryAccept() {
        if (!this.data.token || this.data.acting || this.data.accepted)
            return;
        if (!canAutoAccept()) {
            this.setData({ needLogin: true });
            return;
        }
        this.setData({ acting: true, error: '', needLogin: false });
        try {
            const result = await acceptFamilyInvite(this.data.token);
            this.setData({
                acting: false,
                accepted: true,
                acceptedText: result.alreadyJoined ? '你已在该家庭中，可直接查看设备状态。' : '已加入家庭，现在可以查看设备状态。',
            });
            wx.showToast({ title: result.alreadyJoined ? '已在家庭中' : '加入成功', icon: 'success' });
            setTimeout(() => {
                wx.redirectTo({ url: `/pages/family-profile/index?familyId=${encodeURIComponent(result.familyId)}` });
            }, 700);
        }
        catch (e) {
            const message = typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '加入失败';
            const view = resolveInviteErrorView(message);
            const needLogin = /unauthorized/i.test(message) || !canAutoAccept();
            this.setData({
                acting: false,
                error: message,
                errorTitle: view.title,
                errorDetail: view.detail,
                needLogin,
            });
            if (needLogin) {
                setPendingFamilyInviteToken(this.data.token);
            }
            else {
                clearPendingFamilyInviteToken();
            }
        }
    },
    onGoLogin() {
        if (this.data.token) {
            setPendingFamilyInviteToken(this.data.token);
        }
        wx.switchTab({ url: '/pages/mine/index' });
    },
    onRetry() {
        this.reload();
    },
    onOpenFamily() {
        wx.redirectTo({ url: '/pages/family-profile/index' });
    },
});
