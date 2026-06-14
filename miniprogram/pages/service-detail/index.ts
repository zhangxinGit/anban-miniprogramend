import { isLoggedIn } from '../../utils/auth';
import {
  fetchServiceCatalogPage,
  readServiceItem,
  rememberServiceItems,
  resolveServiceCatalogItemCoverSource,
  type ServiceCatalogItem,
} from '../service-market/catalog';
import {
  cancelServiceBooking,
  createServiceBooking,
  getCurrentServiceBooking,
  type ServiceBooking,
} from '../../services/serviceBooking';
import { showAppModal } from '../../utils/modal';
import { requireLogin } from '../../utils/loginGate';
import { getErrorMessage } from '../../utils/errorMessage';

function matchesCurrentBooking(booking: ServiceBooking | null, item: ServiceCatalogItem | null): boolean {
  return !!booking && !!item && booking.canCancel && booking.serviceCode === item.id;
}

function buildDetailMetaText(item: ServiceCatalogItem | null): string {
  if (!item) {
    return '';
  }
  const parts = [item.moduleTitle, item.tagList[0] || '上门服务'].filter((part, index, array) => !!part && array.indexOf(part) === index);
  return parts.join(' · ');
}

async function prepareServiceItem(item: ServiceCatalogItem): Promise<ServiceCatalogItem> {
  const resolved = await resolveServiceCatalogItemCoverSource(item);
  rememberServiceItems([resolved]);
  return resolved;
}

Page({
  data: {
    loading: true,
    submitting: false,
    currentBookingLoading: false,
    error: '',
    item: null as ServiceCatalogItem | null,
    currentBooking: null as ServiceBooking | null,
    currentBookingMatchesItem: false,
    detailMetaText: '',
    successPopupVisible: false,
    _coverFailed: false,
  },

  /** 上次刷新预约的时间戳 */
  _lastBookingRefresh: 0 as number,
  /** 页面是否隐藏 */
  _pageHidden: false as boolean,

  onLoad(query: Record<string, string>) {
    const id = String(query.id || '').trim();
    if (!id) {
      this.setData({ loading: false, error: '服务不存在' });
      return;
    }
    const page = this as { getOpenerEventChannel?: () => WechatMiniprogram.EventChannel };
    const opener = page.getOpenerEventChannel?.();
    if (opener?.on) {
      opener.on('service-item', (item: ServiceCatalogItem) => {
        if (!item) return;
        void prepareServiceItem(item).then((resolved) => {
          this.setData({
            item: resolved,
            loading: false,
            error: '',
            currentBookingMatchesItem: matchesCurrentBooking(this.data.currentBooking, resolved),
            detailMetaText: buildDetailMetaText(resolved),
          });
        });
      });
    }
    const cached = readServiceItem(id);
    if (cached) {
      void prepareServiceItem(cached).then((resolved) => {
        this.setData({
          item: resolved,
          loading: false,
          error: '',
          currentBookingMatchesItem: matchesCurrentBooking(this.data.currentBooking, resolved),
          detailMetaText: buildDetailMetaText(resolved),
        });
      });
      if (isLoggedIn()) {
        void this.reloadCurrentBooking();
      }
      return;
    }
    if (isLoggedIn()) {
      void this.reloadCurrentBooking();
    }
    void this.loadItem(id);
  },

  onShow() {
    this._pageHidden = false;

    if (isLoggedIn()) {
      // 节流：至少间隔 10 秒才刷新预约状态（避免每次切回都发请求）
      const now = Date.now();
      if (now - (this._lastBookingRefresh || 0) >= 10 * 1000) {
        this._lastBookingRefresh = now;
        void this.reloadCurrentBooking();
      }
      return;
    }
    this.setData({ currentBooking: null, currentBookingMatchesItem: false });
  },

  onHide() {
    this._pageHidden = true;
  },

  onUnload() {
    this._lastBookingRefresh = 0;
    this._pageHidden = false;
  },

  async loadItem(id: string) {
    this.setData({ loading: true, error: '' });
    try {
      let page = 1;
      let total = 0;
      let loaded = 0;
      while (page === 1 || loaded < total) {
        const result = await fetchServiceCatalogPage(page, 20);
        rememberServiceItems(result.list);
        const matched = result.list.find((item) => item.id === id) || null;
        if (matched) {
          const resolved = await prepareServiceItem(matched);
          this.setData({
            item: resolved,
            loading: false,
            error: '',
            currentBookingMatchesItem: matchesCurrentBooking(this.data.currentBooking, resolved),
            detailMetaText: buildDetailMetaText(resolved),
          });
          return;
        }
        total = result.total;
        loaded += result.list.length;
        if (result.list.length === 0) break;
        page += 1;
      }
      this.setData({ loading: false, error: '服务不存在或已下架' });
    } catch (error: unknown) {
      this.setData({ loading: false, error: getErrorMessage(error, '加载失败') });
    }
  },

  async reloadCurrentBooking() {
    if (this._pageHidden) return;
    this.setData({ currentBookingLoading: true });
    try {
      const currentBooking = await getCurrentServiceBooking();
      this.setData({
        currentBooking,
        currentBookingMatchesItem: matchesCurrentBooking(currentBooking, this.data.item),
      });
    } catch {
      this.setData({ currentBooking: null, currentBookingMatchesItem: false });
    } finally {
      this.setData({ currentBookingLoading: false });
    }
  },

  onPreviewCover() {
    const coverImg = this.data.item?.coverSrc || this.data.item?.coverImg || '';
    if (!coverImg) return;
    wx.previewImage({ urls: [coverImg], current: coverImg });
  },

  /** 封面图加载失败时切换为文字占位 */
  onCoverImageError() {
    this.setData({ _coverFailed: true });
  },

  onCallAdvisor() {
    if (!requireLogin({
      title: '登录后联系顾问',
      content: '电话咨询仅支持登录后发起，当前可先浏览服务详情。',
    })) {
      return;
    }
    wx.makePhoneCall({ phoneNumber: '18526209432' });
  },

  onCopyWechat() {
    if (!requireLogin({
      title: '登录后联系顾问',
      content: '微信咨询仅支持登录后发起，当前可先浏览服务详情。',
    })) {
      return;
    }
    wx.setClipboardData({ data: '18526209432' });
  },

  onOpenCurrentBookingService() {
    const currentBooking = this.data.currentBooking;
    if (!currentBooking?.serviceCode || currentBooking.serviceCode === this.data.item?.id) {
      return;
    }
    wx.redirectTo({
      url: `/pages/service-detail/index?id=${encodeURIComponent(currentBooking.serviceCode)}`,
    });
  },

  async onBook() {
    const item = this.data.item;
    if (!item || this.data.submitting || this.data.currentBookingLoading) return;
    if (!requireLogin({
      title: '登录后预约服务',
      content: '当前服务仅支持登录后预约，未登录时可先浏览服务详情。',
    })) {
      return;
    }
    if (this.data.currentBookingMatchesItem) {
      this.onCancelCurrentBooking();
      return;
    }
    this.setData({ submitting: true });
    try {
      const booking = await createServiceBooking({
        serviceCode: item.id,
        serviceTitle: item.serviceName,
        serviceCategory: item.moduleTitle,
      });
      this.setData({
        currentBooking: booking,
        currentBookingMatchesItem: matchesCurrentBooking(booking, item),
        successPopupVisible: true,
      });
    } catch (error: unknown) {
      wx.showToast({ title: getErrorMessage(error, '预约失败'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onCancelCurrentBooking() {
    const currentBooking = this.data.currentBooking;
    if (!currentBooking || !currentBooking.canCancel || this.data.submitting) {
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
        this.setData({ submitting: true });
        try {
          const booking = await cancelServiceBooking(currentBooking.bookingId);
          this.setData({
            currentBooking: booking,
            currentBookingMatchesItem: matchesCurrentBooking(booking, this.data.item),
          });
          wx.showToast({ title: '已取消', icon: 'success' });
        } catch (error: unknown) {
          wx.showToast({ title: getErrorMessage(error, '取消失败'), icon: 'none' });
        } finally {
          this.setData({ submitting: false });
        }
      },
    });
  },

  onCallCurrentBookingContact() {
    const phone = this.data.currentBooking?.serviceContact.phone || '18526209432';
    wx.makePhoneCall({ phoneNumber: phone });
  },

  onOpenBookingHistory() {
    if (!requireLogin({
      title: '登录后查看预约',
      content: '预约记录仅支持登录后查看。',
    })) {
      return;
    }
    wx.navigateTo({ url: '/pages/service-bookings/index' });
  },

  onCloseSuccessPopup() {
    this.setData({ successPopupVisible: false });
  },

  noop() {},
});