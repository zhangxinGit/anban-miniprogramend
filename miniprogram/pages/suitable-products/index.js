import { getCategories, getProducts } from '../../services/suitableProducts';
import { addToCart, getCartCount, getCartTotal, subscribe as subscribeCart } from '../../store/cartStore';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { offlineFirst, cacheForOffline } from '../../utils/offlineCache';
import { requireLogin } from '../../utils/loginGate';
let unsubscribeCart = null;
const CACHE_KEY_CATEGORIES = 'ab_offline_suitable_categories';
const CACHE_PREFIX_PRODUCTS = 'ab_offline_suitable_products';
function productCacheKey(categoryId, keyword, page) {
    const cid = categoryId ? String(categoryId) : 'all';
    const kw = keyword || 'all';
    return `${CACHE_PREFIX_PRODUCTS}_${cid}_${kw}_${page}`;
}
Page({
    data: {
        categories: [],
        activeCategoryId: '',
        products: [],
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
        markPageDead(this);
    },
    onHide() {
        markPageDead(this);
    },
    onShow() {
        markPageAlive(this);
        this.refreshCartBadge();
    },
    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.loadProducts(true);
        }
    },
    refreshCartBadge() {
        const page = this;
        safeSetData(page, {
            cartCount: getCartCount(),
            cartTotal: getCartTotal(),
        });
    },
    async loadCategories() {
        const page = this;
        try {
            const result = await offlineFirst(CACHE_KEY_CATEGORIES, () => getCategories(), { ttlMs: 30 * 60000, honorBreaker: false });
            if (page._pageHidden)
                return;
            if (result) {
                safeSetData(page, { categories: result.data });
                if (result.fresh) {
                    cacheForOffline(CACHE_KEY_CATEGORIES, result.data, 30 * 60000);
                }
            }
        }
        catch {
            // 分类加载失败不阻塞页面
        }
    },
    async loadProducts(append = false) {
        const page = this;
        if (page._pageHidden)
            return;
        this.setData({ loading: true });
        const nextPage = append ? this.data.page + 1 : 1;
        try {
            const params = {
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
            const result = await offlineFirst(cacheKey, () => getProducts(params), {
                ttlMs: 5 * 60000,
                staleMessage: '网络异常，正在使用离线商品数据',
                honorBreaker: false,
            });
            if (page._pageHidden)
                return;
            if (result) {
                const products = append ? [...this.data.products, ...result.data.items] : result.data.items;
                safeSetData(page, {
                    products,
                    page: nextPage,
                    hasMore: result.data.items.length >= this.data.pageSize,
                    loading: false,
                });
            }
            else {
                safeSetData(page, { loading: false });
            }
        }
        catch {
            if (!page._pageHidden) {
                safeSetData(page, { loading: false });
            }
        }
    },
    onSearchInput(e) {
        this.setData({ keyword: e.detail.value });
    },
    onSearchConfirm() {
        this.setData({ products: [], page: 1, hasMore: true });
        this.loadProducts();
    },
    onCategoryTap(e) {
        var _a, _b;
        const categoryId = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        const nextId = this.data.activeCategoryId === categoryId ? '' : categoryId;
        this.setData({
            activeCategoryId: nextId,
            products: [],
            page: 1,
            hasMore: true,
        });
        this.loadProducts();
    },
    onAddToCart(e) {
        // 未登录时弹出登录提示
        if (!requireLogin({
            content: '登录后可将商品加入购物车，方便统一下单。',
        })) {
            return;
        }
        var _a, _b;
        const product = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.product;
        if (!product)
            return;
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
    onProductTap(e) {
        var _a, _b;
        const product = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.product;
        if (!product || !product.id)
            return;
        wx.navigateTo({ url: `/pages/product-detail/detail?id=${product.id}` });
    },
});
