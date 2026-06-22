import { getCategories, getProducts, type ProductCategory, type Product, type ProductListResponse } from '../../services/suitableProducts';
import { addToCart, getCartCount, getCartTotal, subscribe as subscribeCart } from '../../store/cartStore';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { offlineFirst, cacheForOffline } from '../../utils/offlineCache';
import { requireLogin } from '../../utils/loginGate';

type SuitablePageCustom = {
  _pageHidden?: boolean;
};

let unsubscribeCart: (() => void) | null = null;

const CACHE_KEY_CATEGORIES = 'ab_offline_suitable_categories';
const CACHE_PREFIX_PRODUCTS = 'ab_offline_suitable_products';

function productCacheKey(categoryId: string | number, keyword: string, page: number): string {
  const cid = categoryId ? String(categoryId) : 'all';
  const kw = keyword || 'all';
  return `${CACHE_PREFIX_PRODUCTS}_${cid}_${kw}_${page}`;
}

Page({
  data: {
    categories: [] as ProductCategory[],
    activeCategoryId: '' as number | string,
    products: [] as Product[],
    keyword: '',
    loading: false,
    cartCount: 0,
    cartTotal: 0,
    hasMore: true,
    page: 1,
    pageSize: 10,
  },

  onLoad() {
    this.loadCategories();
    this.loadProducts();
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
    markPageDead(this as SuitablePageCustom);
  },

  onHide() {
    markPageDead(this as SuitablePageCustom);
  },

  onShow() {
    markPageAlive(this as SuitablePageCustom);
    this.refreshCartBadge();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadProducts(true);
    }
  },

  refreshCartBadge() {
    const page = this as unknown as SuitablePageCustom;
    safeSetData(page, {
      cartCount: getCartCount(),
      cartTotal: getCartTotal(),
    });
  },

  async loadCategories() {
    const page = this as unknown as SuitablePageCustom;
    try {
      const result = await offlineFirst( CACHE_KEY_CATEGORIES,
        () => getCategories(),
        { ttlMs: 30 * 60_000, honorBreaker: false },
      );
      if (page._pageHidden) return;

      if (result) {
        safeSetData(page, { categories: result.data });
        if (result.fresh) {
          cacheForOffline(CACHE_KEY_CATEGORIES, result.data, 30 * 60_000);
        }
      }
    } catch {
      // 分类加载失败不阻塞页面
    }
  },

  async loadProducts(append = false) {
    const page = this as unknown as SuitablePageCustom;
    if (page._pageHidden) return;

    this.setData({ loading: true });
    const nextPage = append ? this.data.page + 1 : 1;

    try {
      const params: { categoryId?: number | string; keyword?: string; page: number; size: number } = {
        page: nextPage,
        size: this.data.pageSize,
      };
      if (this.data.activeCategoryId) {
        params.categoryId = this.data.activeCategoryId;
      }
      if (this.data.keyword) {
        params.keyword = this.data.keyword;
      }

      const cacheKey = productCacheKey(this.data.activeCategoryId, this.data.keyword, nextPage);
      const result = await offlineFirst(
        cacheKey,
        () => getProducts(params),
        {
          ttlMs: 5 * 60_000,
          staleMessage: '网络异常，正在使用离线商品数据',
          honorBreaker: false,
        },
      );

      if (page._pageHidden) return;

      if (result) {
        const products = append ? [...this.data.products, ...result.data.items] : result.data.items;
        safeSetData(page, {
          products,
          page: nextPage,
          hasMore: result.data.items.length >= this.data.pageSize,
          loading: false,
        });
      } else {
        safeSetData(page, { loading: false });
      }
    } catch {
      if (!page._pageHidden) {
        safeSetData(page, { loading: false });
      }
    }
  },

  onSearchInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.setData({ products: [], page: 1, hasMore: true });
    this.loadProducts();
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const categoryId = e.currentTarget?.dataset?.id;
    const nextId = this.data.activeCategoryId === categoryId ? '' : categoryId;
    this.setData({
      activeCategoryId: nextId,
      products: [],
      page: 1,
      hasMore: true,
    });
    this.loadProducts();
  },

  onAddToCart(e: WechatMiniprogram.BaseEvent) {
    // 未登录时弹出登录提示
    if (!requireLogin({
      content: '登录后可将商品加入购物车，方便统一下单。',
    })) {
      return;
    }

    const product = e.currentTarget?.dataset?.product as Product | undefined;
    if (!product) return;
    addToCart({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      spec: product.spec,
      price: product.price,
    });
    wx.showToast({ title: '已加入购物车', icon: 'success' });
  },

  onGoToCart() {
    wx.navigateTo({ url: '/pages/suitable-products/cart' });
  },

  onProductTap(e: WechatMiniprogram.BaseEvent) {
    const product = e.currentTarget?.dataset?.product as Product | undefined;
    if (!product || !product.id) return;
    wx.navigateTo({ url: `/pages/product-detail/detail?id=${product.id}` });
  },
});
