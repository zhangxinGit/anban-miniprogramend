import { getCart, removeFromCart, updateQuantity, getCartTotal, getCartCount, clearCart, subscribe as subscribeCart } from '../../store/cartStore';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import type { CartItem } from '../../store/cartStore';

type CartPageCustom = {
  _pageHidden?: boolean;
};

let unsubscribeCart: (() => void) | null = null;

Page({
  data: {
    items: [] as CartItem[],
    totalCount: 0,
    totalAmount: 0,
    isEmpty: true,
  },

  onLoad() {
    this.refreshCart();
    unsubscribeCart = subscribeCart(() => {
      this.refreshCart();
    });
  },

  onUnload() {
    if (unsubscribeCart) {
      unsubscribeCart();
      unsubscribeCart = null;
    }
    markPageDead(this as CartPageCustom);
  },

  onHide() {
    markPageDead(this as CartPageCustom);
  },

  onShow() {
    markPageAlive(this as CartPageCustom);
    this.refreshCart();
  },

  refreshCart() {
    const rawItems = getCart();
    const items = rawItems.map((item) => ({
      ...item,
      subtotal: (item.price * item.quantity).toFixed(2),
    }));
    const page = this as unknown as CartPageCustom;
    safeSetData(page, {
      items,
      totalCount: getCartCount(),
      totalAmount: getCartTotal().toFixed(2),
      isEmpty: rawItems.length === 0,
    });
  },

  onDecrease(e: WechatMiniprogram.BaseEvent) {
    const productId = e.currentTarget?.dataset?.id;
    if (productId === undefined) return;
    const item = getCart().find((i) => i.productId === productId);
    if (!item) return;
    if (item.quantity <= 1) {
      wx.showModal({
        title: '确认删除',
        content: '确定要从购物车移除该商品吗？',
        success: (res) => {
          if (res.confirm) {
            removeFromCart(productId);
          }
        },
      });
    } else {
      updateQuantity(productId, item.quantity - 1);
    }
  },

  onIncrease(e: WechatMiniprogram.BaseEvent) {
    const productId = e.currentTarget?.dataset?.id;
    if (productId === undefined) return;
    const item = getCart().find((i) => i.productId === productId);
    if (!item) return;
    updateQuantity(productId, item.quantity + 1);
  },

  onRemove(e: WechatMiniprogram.BaseEvent) {
    const productId = e.currentTarget?.dataset?.id;
    if (productId === undefined) return;
    wx.showModal({
      title: '确认删除',
      content: '确定要从购物车移除该商品吗？',
      success: (res) => {
        if (res.confirm) {
          removeFromCart(productId);
        }
      },
    });
  },

  onClearCart() {
    wx.showModal({
      title: '清空购物车',
      content: '确定要清空所有商品吗？',
      success: (res) => {
        if (res.confirm) {
          clearCart();
        }
      },
    });
  },

  onSubmitOrder() {
    const items = getCart();
    if (items.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/suitable-products/order' });
  },

  onGoShopping() {
    wx.navigateBack();
  },
});
