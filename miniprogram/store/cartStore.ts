/**
 * 购物车状态管理 — 简单的发布-订阅模式
 */

export type CartItem = {
  productId: number | string;
  name: string;
  imageUrl: string;
  spec: string;
  price: number;
  quantity: number;
};

type Listener = () => void;

const CART_STORAGE_KEY = 'ab_cart_items';

let cartItems: CartItem[] = [];
let listeners: Listener[] = [];

function loadFromStorage(): void {
  try {
    const raw = wx.getStorageSync(CART_STORAGE_KEY);
    if (Array.isArray(raw)) {
      cartItems = raw as CartItem[];
    }
  } catch {
    cartItems = [];
  }
}

function saveToStorage(): void {
  try {
    wx.setStorageSync(CART_STORAGE_KEY, cartItems);
  } catch {
    // ignore
  }
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

// 初始化加载
loadFromStorage();

/**
 * 获取当前购物车列表
 */
export function getCart(): CartItem[] {
  return cartItems;
}

/**
 * 添加商品到购物车，已存在则数量 +1
 */
export function addToCart(product: Omit<CartItem, 'quantity'>): void {
  const existing = cartItems.find((item) => item.productId === product.productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cartItems.push({ ...product, quantity: 1 });
  }
  saveToStorage();
  notify();
}

/**
 * 从购物车移除商品
 */
export function removeFromCart(productId: number | string): void {
  cartItems = cartItems.filter((item) => item.productId !== productId);
  saveToStorage();
  notify();
}

/**
 * 更新商品数量
 */
export function updateQuantity(productId: number | string, qty: number): void {
  const item = cartItems.find((i) => i.productId === productId);
  if (!item) return;
  const next = Math.max(0, qty);
  if (next === 0) {
    cartItems = cartItems.filter((i) => i.productId !== productId);
  } else {
    item.quantity = next;
  }
  saveToStorage();
  notify();
}

/**
 * 清空购物车
 */
export function clearCart(): void {
  cartItems = [];
  saveToStorage();
  notify();
}

/**
 * 计算购物车总金额
 */
export function getCartTotal(): number {
  return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * 计算购物车商品总数量
 */
export function getCartCount(): number {
  return cartItems.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * 订阅购物车变化
 * @returns 取消订阅的函数
 */
export function subscribe(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
