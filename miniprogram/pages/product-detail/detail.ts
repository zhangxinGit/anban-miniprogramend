import { getProductDetail, type Product } from '../../services/suitableProducts';
import { addToCart, getCartCount, subscribe as subscribeCart } from '../../store/cartStore';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { requireLogin } from '../../utils/loginGate';

type ProductDetailPageCustom = {
  _pageHidden?: boolean;
};

let unsubscribeCart: (() => void) | null = null;

Page({
  data: {
    productId: '' as number | string,
    product: null as Product | null,
    loading: true,
    cartCount: 0,
    quantity: 1,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options?.id;
    if (!id) {
      wx.showToast({ title: '缺少商品ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ productId: id });
    this.loadProductDetail();

    unsubscribeCart = subscribeCart(() => {
      this.refreshCartBadge();
    });
    this.refreshCartBadge();
  },

  onUnload() {
    if (unsubscribeCart) {
      unsubscribeCart();
      unsubscribeCart = null;
    }
    markPageDead(this as ProductDetailPageCustom);
  },

  onHide() {
    markPageDead(this as ProductDetailPageCustom);
  },

  onShow() {
    markPageAlive(this as ProductDetailPageCustom);
    this.refreshCartBadge();
  },

  refreshCartBadge() {
    const page = this as unknown as ProductDetailPageCustom;
    safeSetData(page, { cartCount: getCartCount() });
  },

  async loadProductDetail() {
    const page = this as unknown as ProductDetailPageCustom;
    this.setData({ loading: true });
    try {
      const product = await getProductDetail(this.data.productId);
      if (page._pageHidden) return;
      safeSetData(page, { product, loading: false });
    } catch (err: unknown) {
      if (!page._pageHidden) {
        const msg = err instanceof Error ? err.message : '加载商品详情失败';
        wx.showToast({ title: msg, icon: 'none' });
        safeSetData(page, { loading: false });
      }
    }
  },

  onPreviewImage() {
    const product = this.data.product;
    if (!product || !product.imageUrl) return;
    wx.previewImage({
      current: product.imageUrl,
      urls: [product.imageUrl],
    });
  },

  onQuantityChange(e: WechatMiniprogram.Input) {
    let qty = parseInt(e.detail.value, 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    this.setData({ quantity: qty });
  },

  onDecQuantity() {
    if (this.data.quantity > 1) {
      this.setData({ quantity: this.data.quantity - 1 });
    }
  },

  onIncQuantity() {
    if (this.data.quantity < 99) {
      this.setData({ quantity: this.data.quantity + 1 });
    }
  },

  onAddToCart() {
    if (!requireLogin({
      content: '登录后可将商品加入购物车，方便统一下单。',
    })) {
      return;
    }
    const product = this.data.product;
    if (!product) return;
    const qty = this.data.quantity;
    for (let i = 0; i < qty; i++) {
      addToCart({
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        spec: product.spec,
        price: product.price,
      });
    }
    wx.showToast({ title: `已加入${qty}件`, icon: 'success' });
  },

  onBuyNow() {
    this.onAddToCart();
    setTimeout(() => {
      wx.navigateTo({ url: '/pages/suitable-products/cart' });
    }, 800);
  },

  onGoToCart() {
    wx.navigateTo({ url: '/pages/suitable-products/cart' });
  },

  onShareAppMessage() {
    const product = this.data.product;
    if (!product) {
      return {
        title: '安伴适老好物',
        path: '/pages/suitable-products/index',
      };
    }
    return {
      title: `${product.name} - 安伴适老好物`,
      path: `/pages/product-detail/detail?id=${product.id}`,
    };
  },
});
