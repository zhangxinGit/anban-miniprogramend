import { isLoggedIn } from '../../utils/auth';
import {
  cancelServiceBooking,
  listServiceBookings,
  type ServiceBooking,
} from '../../services/serviceBooking';
import { showAppModal } from '../../utils/modal';
import { getErrorMessage } from '../../utils/errorMessage';

type BookingTab = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

function toRequestStatus(tab: BookingTab): 'pending' | 'completed' | 'cancelled' | undefined {
  switch (tab) {
    case 'PENDING':
      return 'pending';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return undefined;
  }
}

function emptyTextForTab(tab: BookingTab): string {
  switch (tab) {
    case 'PENDING':
      return '你还没有待服务的服务预约';
    case 'COMPLETED':
      return '暂时没有已完成的服务预约';
    case 'CANCELLED':
      return '暂时没有已取消的服务预约';
    default:
      return '你还没有服务预约记录';
  }
}

Page({
  data: {
    loading: true,
    actionLoading: false,
    error: '',
    activeTab: 'ALL' as BookingTab,
    records: [] as ServiceBooking[],
    emptyText: emptyTextForTab('ALL'),
  },

  /** 上次刷新时间戳 */
  _lastRefresh: 0 as number,
  /** 是否正在加载 */
  _loading: false as boolean,
  /** 页面是否隐藏 */
  _pageHidden: false as boolean,

  onLoad() {
    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/mine/index' });
      return;
    }
    void this.reload();
  },

  onShow() {
    this._pageHidden = false;

    if (!isLoggedIn()) {
      wx.redirectTo({ url: '/pages/mine/index' });
      return;
    }
    // 节流：至少间隔 10 秒才刷新预约记录
    const now = Date.now();
    if (now - (this._lastRefresh || 0) >= 10 * 1000) {
      this._lastRefresh = now;
      void this.reload();
    }
  },

  onHide() {
    this._pageHidden = true;
  },

  onUnload() {
    this._lastRefresh = 0;
    this._loading = false;
    this._pageHidden = false;
  },

  onPullDownRefresh() {
    void this.reload().finally(() => wx.stopPullDownRefresh());
  },

  async reload() {
    if (this._loading || this._pageHidden) return;
    this._loading = true;
    const activeTab = this.data.activeTab;
    this.setData({ loading: true, error: '', emptyText: emptyTextForTab(activeTab) });
    try {
      const records = await listServiceBookings(toRequestStatus(activeTab));
      this.setData({ records, loading: false });
    } catch (error: unknown) {
      this.setData({ loading: false, error: getErrorMessage(error, '加载服务预约记录失败') });
    } finally {
      this._loading = false;
    }
  },

  onSwitchTab(event: WechatMiniprogram.BaseEvent) {
    const nextTab = String(event.currentTarget.dataset.tab || '') as BookingTab;
    if (!nextTab || nextTab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: nextTab, emptyText: emptyTextForTab(nextTab) });
    void this.reload();
  },

  onRetry() {
    void this.reload();
  },

  onOpenService(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id || '').trim();
    if (!id) {
      return;
    }
    wx.navigateTo({ url: `/pages/service-detail/index?id=${encodeURIComponent(id)}` });
  },

  onCallManager(event: WechatMiniprogram.BaseEvent) {
    const phone = String(event.currentTarget.dataset.phone || '').trim() || '18526209432';
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onCancelBooking(event: WechatMiniprogram.BaseEvent) {
    const bookingId = Number(event.currentTarget.dataset.id || 0);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || this.data.actionLoading) {
      return;
    }
    showAppModal({
      title: '取消服务预约',
      content: '确认取消当前服务预约吗？',
      confirmText: '取消预约',
      tone: 'danger',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        this.setData({ actionLoading: true });
        try {
          await cancelServiceBooking(bookingId);
          wx.showToast({ title: '已取消', icon: 'success' });
          await this.reload();
        } catch (error: unknown) {
          wx.showToast({ title: getErrorMessage(error, '取消失败'), icon: 'none' });
        } finally {
          this.setData({ actionLoading: false });
        }
      },
    });
  },
});