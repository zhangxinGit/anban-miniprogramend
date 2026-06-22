import { loginStaffAccount } from '../../services/staffAuth';
import { hasStaffSession } from '../../utils/staffAuth';
Page({
    data: {
        phone: '',
        password: '',
        loading: false,
    },
    redirectUrl: '',
    onLoad(query) {
        this.redirectUrl = typeof (query === null || query === void 0 ? void 0 : query.redirect) === 'string' ? decodeURIComponent(query.redirect) : '';
        if (hasStaffSession()) {
            this.redirectAfterLogin();
        }
    },
    onPhoneInput(e) {
        var _a;
        const value = typeof ((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) === 'string' ? e.detail.value : '';
        this.setData({ phone: value.replace(/\D/g, '').slice(0, 11) });
    },
    onPasswordInput(e) {
        var _a;
        const value = typeof ((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) === 'string' ? e.detail.value : '';
        this.setData({ password: value });
    },
    async onSubmit() {
        if (this.data.loading)
            return;
        this.setData({ loading: true });
        try {
            await loginStaffAccount(this.data.phone, this.data.password);
            wx.showToast({ title: '登录成功', icon: 'success' });
            this.redirectAfterLogin();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '登录失败';
            wx.showToast({ title: message, icon: 'none' });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    onBack() {
        if (getCurrentPages().length > 1) {
            wx.navigateBack({ delta: 1 });
            return;
        }
        wx.switchTab({ url: '/pages/mine/index' });
    },
    redirectAfterLogin() {
        const nextUrl = this.redirectUrl || '/pages/staff-workbench/index';
        wx.redirectTo({ url: nextUrl });
    },
});
