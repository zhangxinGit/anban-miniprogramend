import { getCart, getCartTotal, getCartCount, clearCart } from '../../store/cartStore';
import { submitOrder } from '../../services/suitableProducts';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
Page({
    data: {
        items: [],
        totalCount: 0,
        totalAmount: 0,
        orderName: '',
        receiverName: '',
        receiverPhone: '',
        receiverAddress: '',
        deliveryTime: '',
        remark: '',
        submitting: false,
    },
    onLoad() {
        this.loadCartItems();
    },
    onUnload() {
        markPageDead(this);
    },
    onHide() {
        markPageDead(this);
    },
    onShow() {
        markPageAlive(this);
        this.loadCartItems();
    },
    loadCartItems() {
        const rawItems = getCart();
        if (rawItems.length === 0) {
            wx.showToast({ title: '购物车为空，请先添加商品', icon: 'none' });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
            return;
        }
        const items = rawItems.map((item) => ({
            ...item,
            subtotal: (item.price * item.quantity).toFixed(2),
        }));
        const page = this;
        safeSetData(page, {
            items,
            totalCount: getCartCount(),
            totalAmount: getCartTotal().toFixed(2),
        });
    },
    onOrderNameInput(e) {
        this.setData({ orderName: e.detail.value });
    },
    onReceiverNameInput(e) {
        this.setData({ receiverName: e.detail.value });
    },
    onReceiverPhoneInput(e) {
        this.setData({ receiverPhone: e.detail.value });
    },
    onReceiverAddressInput(e) {
        this.setData({ receiverAddress: e.detail.value });
    },
    onDeliveryTimeChange(e) {
        this.setData({ deliveryTime: e.detail.value });
    },
    onRemarkInput(e) {
        this.setData({ remark: e.detail.value });
    },
    onBackToCart() {
        wx.navigateBack();
    },
    validateForm() {
        const { orderName, receiverName, receiverPhone, receiverAddress, deliveryTime } = this.data;
        if (!orderName.trim())
            return '请填写订单名称';
        if (!receiverName.trim())
            return '请填写收货人';
        if (!receiverPhone.trim())
            return '请填写联系电话';
        if (!/^1\d{10}$/.test(receiverPhone.trim()))
            return '请输入正确的手机号码';
        if (!receiverAddress.trim())
            return '请填写详细收货地址';
        if (!deliveryTime)
            return '请选择预约配送时间';
        return null;
    },
    async onSubmitOrder() {
        const error = this.validateForm();
        if (error) {
            wx.showToast({ title: error, icon: 'none' });
            return;
        }
        if (this.data.submitting)
            return;
        const page = this;
        this.setData({ submitting: true });
        try {
            const orderData = {
                orderName: this.data.orderName.trim(),
                receiverName: this.data.receiverName.trim(),
                receiverPhone: this.data.receiverPhone.trim(),
                receiverAddress: this.data.receiverAddress.trim(),
                deliveryTime: this.data.deliveryTime,
                remark: this.data.remark.trim(),
                items: this.data.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                })),
            };
            const order = await submitOrder(orderData);
            if (page._pageHidden)
                return;
            clearCart();
            wx.showToast({ title: '下单成功', icon: 'success' });
            setTimeout(() => {
                wx.redirectTo({ url: `/pages/suitable-products/detail?id=${order.id}` });
            }, 1200);
        }
        catch (err) {
            if (!page._pageHidden) {
                const msg = err instanceof Error ? err.message : '提交订单失败';
                wx.showToast({ title: msg, icon: 'none' });
                safeSetData(page, { submitting: false });
            }
        }
    },
});
