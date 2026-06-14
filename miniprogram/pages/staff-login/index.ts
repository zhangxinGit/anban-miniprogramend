import { loginStaffAccount } from '../../services/staffAuth';
import { hasStaffSession } from '../../utils/staffAuth';

type Query = {
  redirect?: string;
};

Page({
  data: {
    phone: '',
    password: '',
    loading: false,
  },

  redirectUrl: '' as string,

  onLoad(query: Query) {
    this.redirectUrl = typeof query?.redirect === 'string' ? decodeURIComponent(query.redirect) : '';
    if (hasStaffSession()) {
      this.redirectAfterLogin();
    }
  },

  onPhoneInput(e: WechatMiniprogram.Input) {
    const value = typeof e?.detail?.value === 'string' ? e.detail.value : '';
    this.setData({ phone: value.replace(/\D/g, '').slice(0, 11) });
  },

  onPasswordInput(e: WechatMiniprogram.Input) {
    const value = typeof e?.detail?.value === 'string' ? e.detail.value : '';
    this.setData({ password: value });
  },

  async onSubmit() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await loginStaffAccount(this.data.phone, this.data.password);
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.redirectAfterLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
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