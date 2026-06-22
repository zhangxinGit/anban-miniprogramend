import { getCart, removeFromCart, updateQuantity, getCartTotal, getCartCount, clearCart, subscribe as subscribeCart } from '../../store/cartStore';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
let unsubscribeCart = null;
Page({
    data: {
        items: [],
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
        markPageDead(this);
    },
    onHide() {
        markPageDead(this);
    },
    onShow() {
        markPageAlive(this);
        this.refreshCart();
    },
    refreshCart() {
        const rawItems = getCart();
        const items = rawItems.map((item) => ({
            ...item,
            subtotal: (item.price * item.quantity).toFixed(2),
        }));
        const page = this;
        safeSetData(page, {
            items,
            totalCount: getCartCount(),
            totalAmount: getCartTotal().toFixed(2),
            isEmpty: rawItems.length === 0,
        });
    },
    onDecrease(e) {
        var _a, _b;
        const productId = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        if (productId === undefined)
            return;
        const item = getCart().find((i) => i.productId === productId);
        if (!item)
            return;
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
        }
        else {
            updateQuantity(productId, item.quantity - 1);
        }
    },
    onIncrease(e) {
        var _a, _b;
        const productId = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        if (productId === undefined)
            return;
        const item = getCart().find((i) => i.productId === productId);
        if (!item)
            return;
        updateQuantity(productId, item.quantity + 1);
    },
    onRemove(e) {
        var _a, _b;
        const productId = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        if (productId === undefined)
            return;
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
