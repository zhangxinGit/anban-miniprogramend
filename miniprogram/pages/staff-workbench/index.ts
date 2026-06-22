import { clearStaffSession, ensureStaffSession, getStaffAuthState, staffRoleLabel } from '../../utils/staffAuth';
import { maskPhone } from '../../utils/phone';
import { countActiveQuestions, fetchActiveSections } from '../../services/fallRiskQuestions';

Page({
  data: {
    displayName: '工作人员',
    usernameMask: '',
    roleLabel: '工作人员',
    showLogoutPopup: false,
    questionCount: 46,
  },

  async onShow() {
    if (!(await ensureStaffSession('/pages/staff-workbench/index'))) {
      return;
    }
    const state = getStaffAuthState();
    const usernameMask = maskPhone(state.username || '');
    const displayName = (state.name || '').trim() || usernameMask || '工作人员';
    this.setData({
      displayName,
      usernameMask,
      roleLabel: staffRoleLabel(state.role),
    });
    void this.loadQuestionCount();
  },

  async loadQuestionCount() {
    try {
      const sections = await fetchActiveSections();
      this.setData({ questionCount: countActiveQuestions(sections) });
    } catch {
      // keep default fallback
    }
  },

  onCreateAssessment() {
    wx.navigateTo({ url: '/pages/staff-assessment/index' });
  },

  onOpenMineHistory() {
    wx.navigateTo({ url: `/pages/staff-assessment-list/index?mode=mine&title=${encodeURIComponent('历史评估记录')}` });
  },

  onOpenArchives() {
    wx.navigateTo({ url: `/pages/staff-assessment-list/index?mode=all&title=${encodeURIComponent('老人档案列表')}` });
  },

  onLogout() {
    this.setData({ showLogoutPopup: true });
  },

  onCloseLogoutPopup() {
    this.setData({ showLogoutPopup: false });
  },

  onConfirmLogout() {
    this.setData({ showLogoutPopup: false });
    clearStaffSession();
    wx.showToast({ title: '已退出', icon: 'none' });
    wx.switchTab({ url: '/pages/mine/index' });
  },

  noop() {},
});