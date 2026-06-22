import { getPendingFamilyInviteUrl } from '../../services/familyInvitation';
import { applyPendingReferral, clearPendingReferralCode } from '../../services/referral';
import { sendVerificationCode, loginWithSmsCode } from '../../services/smsAuth';
function shouldClearPendingReferral(message) {
    return /邀请码无效|不能绑定自己的邀请码|已绑定推荐人/i.test(message || '');
}
Page({
    data: {
        phone: '',
        code: '',
        codeSeconds: 0,
        loginLoading: false,
    },
    _timer: 0,
    onUnload() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = 0;
        }
    },
    onPhoneInput(e) {
        var _a;
        this.setData({ phone: (((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) || '').replace(/\D/g, '').slice(0, 11) });
    },
    onCodeInput(e) {
        var _a;
        this.setData({ code: (((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) || '').replace(/\D/g, '').slice(0, 6) });
    },
    clearCountdown() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = 0;
        }
        this.setData({ codeSeconds: 0 });
    },
    startCodeCountdown() {
        if (this._timer)
            clearInterval(this._timer);
        this.setData({ codeSeconds: 60 });
        this._timer = setInterval(() => {
            const s = this.data.codeSeconds - 1;
            if (s <= 0) {
                clearInterval(this._timer);
                this._timer = 0;
                this.setData({ codeSeconds: 0 });
                return;
            }
            this.setData({ codeSeconds: s });
        }, 1000);
    },
    async onSendCode() {
        if (this.data.codeSeconds > 0)
            return;
        // 立即启动倒计时，按钮立即置灰不可点击
        this.startCodeCountdown();
        try {
            await sendVerificationCode(this.data.phone);
            wx.showToast({ title: '验证码已发送', icon: 'success' });
        }
        catch (e) {
            // 发送失败：重置倒计时，恢复按钮
            this.clearCountdown();
            wx.showToast({ title: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '发送失败', icon: 'none' });
        }
    },
    async onLogin() {
        if (this.data.loginLoading)
            return;
        const p = (this.data.phone || '').trim();
        const c = (this.data.code || '').trim();
        if (p.length !== 11) {
            wx.showToast({ title: '请填写手机号', icon: 'none' });
            return;
        }
        if (c.length !== 6) {
            wx.showToast({ title: '请填写6位验证码', icon: 'none' });
            return;
        }
        this.setData({ loginLoading: true });
        try {
            await loginWithSmsCode(p, c);
            wx.showToast({ title: '登录成功', icon: 'success' });
            const pendingInviteUrl = getPendingFamilyInviteUrl();
            if (pendingInviteUrl) {
                wx.redirectTo({ url: pendingInviteUrl });
                return;
            }
            try {
                const referralResult = await applyPendingReferral('share');
                if (referralResult) {
                    wx.redirectTo({ url: '/pages/safety-check/index' });
                    return;
                }
            }
            catch (e) {
                const message = typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '推荐关系绑定失败';
                if (shouldClearPendingReferral(message)) {
                    clearPendingReferralCode();
                }
                wx.showToast({ title: message, icon: 'none' });
            }
            wx.switchTab({ url: '/pages/mine/index' });
        }
        catch (e) {
            wx.showToast({ title: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '登录失败', icon: 'none' });
        }
        finally {
            this.setData({ loginLoading: false });
        }
    },
    onBack() {
        wx.navigateBack({ delta: 1 });
    },
});
