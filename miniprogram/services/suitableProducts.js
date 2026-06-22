import { request } from '../utils/request';
// ---------- Constants ----------
/** 订单状态映射表，供多页面共享，避免重复定义 */
export const ORDER_STATUS_MAP = {
    PENDING: { text: '待接单', class: 'status-pending' },
    DELIVERING: { text: '配送中', class: 'status-delivering' },
    DELIVERED: { text: '已送达', class: 'status-delivered' },
    COMPLETED: { text: '已完成', class: 'status-completed' },
};
// ---------- API Functions ----------
/**
 * 获取商品分类列表
 */
export async function getCategories() {
    const res = await request({
        url: '/app/api/products/categories',
        method: 'GET',
        skipBreaker: true,
    });
    if (!res.ok)
        throw new Error(res.message || '获取分类失败');
    return res.data;
}
/**
 * 获取商品列表
 */
export async function getProducts(params = {}) {
    const queryParts = [];
    if (params.categoryId) {
        queryParts.push(`categoryId=${encodeURIComponent(String(params.categoryId))}`);
    }
    if (params.keyword) {
        queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
    }
    if (params.page) {
        queryParts.push(`page=${params.page}`);
    }
    if (params.size) {
        queryParts.push(`size=${params.size}`);
    }
    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const res = await request({
        url: `/app/api/products${query}`,
        method: 'GET',
        skipBreaker: true,
    });
    if (!res.ok)
        throw new Error(res.message || '获取商品列表失败');
    return res.data;
}
/**
 * 获取商品详情
 */
export async function getProductDetail(id) {
    const res = await request({
        url: `/app/api/products/${id}`,
        method: 'GET',
        skipBreaker: true,
    });
    if (!res.ok)
        throw new Error(res.message || '获取商品详情失败');
    return res.data;
}
/**
 * 提交订单
 */
export async function submitOrder(data) {
    const res = await request({
        url: '/app/api/product-orders',
        method: 'POST',
        data,
    });
    if (!res.ok)
        throw new Error(res.message || '提交订单失败');
    return res.data;
}
/**
 * 获取我的订单列表
 */
export async function getMyOrders() {
    const res = await request({
        url: '/app/api/product-orders/my',
        method: 'GET',
    });
    if (!res.ok)
        throw new Error(res.message || '获取订单列表失败');
    return res.data;
}
/**
 * 获取订单详情
 */
export async function getOrderDetail(id) {
    const res = await request({
        url: `/app/api/product-orders/${id}`,
        method: 'GET',
    });
    if (!res.ok)
        throw new Error(res.message || '获取订单详情失败');
    return res.data;
}
