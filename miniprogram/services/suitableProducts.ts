import { request } from '../utils/request';

// ---------- Constants ----------

/** 订单状态映射表，供多页面共享，避免重复定义 */
export const ORDER_STATUS_MAP: Record<string, { text: string; class: string }> = {
  PENDING: { text: '待接单', class: 'status-pending' },
  DELIVERING: { text: '配送中', class: 'status-delivering' },
  DELIVERED: { text: '已送达', class: 'status-delivered' },
  COMPLETED: { text: '已完成', class: 'status-completed' },
};

// ---------- Types ----------

export type ProductCategory = {
  id: number | string;
  name: string;
  icon?: string;
};

export type Product = {
  id: number | string;
  name: string;
  imageUrl: string;
  spec: string;
  price: number;
  categoryId: number | string;
  categoryName?: string;
  description?: string;
};

export type ProductListParams = {
  categoryId?: number | string;
  keyword?: string;
  page?: number;
  size?: number;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  size: number;
};

export type OrderItem = {
  productId: number | string;
  productName: string;
  imageUrl: string;
  spec: string;
  price: number;
  quantity: number;
};

export type SubmitOrderData = {
  orderName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  deliveryTime: string;
  remark?: string;
  items: Pick<OrderItem, 'productId' | 'quantity'>[];
};

export type ProductOrder = {
  id: number | string;
  orderNo: string;
  orderName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  deliveryTime: string;
  remark: string;
  status: string;
  statusText: string;
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt?: string;
};

// ---------- API Functions ----------

/**
 * 获取商品分类列表
 */
export async function getCategories(): Promise<ProductCategory[]> {
  const res = await request<ProductCategory[]>({
    url: '/app/api/products/categories',
    method: 'GET',
    skipBreaker: true,
  });
  if (!res.ok) throw new Error(res.message || '获取分类失败');
  return res.data;
}

/**
 * 获取商品列表
 */
export async function getProducts(params: ProductListParams = {}): Promise<ProductListResponse> {
  const queryParts: string[] = [];
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

  const res = await request<ProductListResponse>({
    url: `/app/api/products${query}`,
    method: 'GET',
    skipBreaker: true,
  });
  if (!res.ok) throw new Error(res.message || '获取商品列表失败');
  return res.data;
}

/**
 * 获取商品详情
 */
export async function getProductDetail(id: number | string): Promise<Product> {
  const res = await request<Product>({
    url: `/app/api/products/${id}`,
    method: 'GET',
    skipBreaker: true,
  });
  if (!res.ok) throw new Error(res.message || '获取商品详情失败');
  return res.data;
}

/**
 * 提交订单
 */
export async function submitOrder(data: SubmitOrderData): Promise<ProductOrder> {
  const res = await request<ProductOrder>({
    url: '/app/api/product-orders',
    method: 'POST',
    data,
  });
  if (!res.ok) throw new Error(res.message || '提交订单失败');
  return res.data;
}

/**
 * 获取我的订单列表
 */
export async function getMyOrders(): Promise<ProductOrder[]> {
  const res = await request<ProductOrder[]>({
    url: '/app/api/product-orders/my',
    method: 'GET',
  });
  if (!res.ok) throw new Error(res.message || '获取订单列表失败');
  return res.data;
}

/**
 * 获取订单详情
 */
export async function getOrderDetail(id: number | string): Promise<ProductOrder> {
  const res = await request<ProductOrder>({
    url: `/app/api/product-orders/${id}`,
    method: 'GET',
  });
  if (!res.ok) throw new Error(res.message || '获取订单详情失败');
  return res.data;
}
