import { getOrderDetail, ORDER_STATUS_MAP, type ProductOrder } from '../../services/suitableProducts';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { offlineFirst, cacheForOffline } from '../../utils/offlineCache';

// --- Privacy Mask Utilities ---

function maskName(name: string): string {
  if (!name) return '***';
  if (name.length === 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(Math.min(name.length - 2, 2)) + name[name.length - 1];
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '****';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

function maskAddress(address: string): string {
  if (!address) return '**';
  // 保留省市区，隐去详细门牌号
  const matched = address.match(/^(.{2,}?(?:省|市|区|县|镇|乡|旗))/);
  if (matched) return matched[0] + '****';
  // fallback: 保留前6个字符
  return address.substring(0, Math.min(6, address.length)) + '****';
}

function maskOrderNo(orderNo: string): string {
  if (!orderNo || orderNo.length < 8) return '****';
  return orderNo.substring(0, 5) + '****' + orderNo.substring(orderNo.length - 3);
}

// --- Types ---

type DetailPageCustom = {
  _pageHidden?: boolean;
};

function getStatusMeta(status: string): { text: string; class: string } {
  return ORDER_STATUS_MAP[status] || { text: status || '未知', class: 'status-unknown' };
}

function orderCacheKey(id: string | number): string {
  return `ab_offline_suitable_order_${id}`;
}

// --- Share Canvas Constants ---
const SHARE_CANVAS_WIDTH = 500;
const SHARE_CANVAS_HEIGHT = 580;

interface ShareImageInfo {
  orderNo: string;
  orderName: string;
  createdAt: string;
  items: { productName: string; price: number; quantity: number }[];
  totalAmount: number;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
}

Page({
  data: {
    orderId: '' as number | string,
    order: null as ProductOrder | null,
    loading: true,
    statusText: '',
    statusClass: '',
    isShareMode: false,
    // masked fields for share mode
    maskedReceiverName: '',
    maskedReceiverPhone: '',
    maskedReceiverAddress: '',
    maskedOrderNo: '',
    // share image
    shareImagePath: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options?.id;
    const share = options?.share;
    if (!id) {
      wx.showToast({ title: '缺少订单ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ orderId: id, isShareMode: share === '1' });
    this.loadOrderDetail();
  },

  onUnload() {
    markPageDead(this as DetailPageCustom);
  },

  onHide() {
    markPageDead(this as DetailPageCustom);
  },

  onShow() {
    markPageAlive(this as DetailPageCustom);
  },

  async loadOrderDetail() {
    const page = this as unknown as DetailPageCustom;
    this.setData({ loading: true });

    try {
      const cacheKey = orderCacheKey(this.data.orderId);
      const result = await offlineFirst(
        cacheKey,
        () => getOrderDetail(this.data.orderId),
        {
          ttlMs: 10 * 60_000,
          staleMessage: '网络异常，正在查看离线订单',
        },
      );

      if (page._pageHidden) return;

      if (result) {
        const raw = result.data;
        const order = {
          ...raw,
          items: (raw.items || []).map((item) => ({
            ...item,
            subtotal: ((item.price || 0) * (item.quantity || 0)).toFixed(2),
          })),
        };
        const statusMeta = getStatusMeta(order.status);

        const maskedReceiverName = maskName(order.receiverName);
        const maskedReceiverPhone = maskPhone(order.receiverPhone);
        const maskedReceiverAddress = maskAddress(order.receiverAddress);
        const maskedOrderNo = maskOrderNo(order.orderNo);

        safeSetData(page, {
          order,
          loading: false,
          statusText: statusMeta.text,
          statusClass: statusMeta.class,
          maskedReceiverName,
          maskedReceiverPhone,
          maskedReceiverAddress,
          maskedOrderNo,
        });

        if (result.fresh) {
          cacheForOffline(cacheKey, order, 10 * 60_000);
        }

        // 非分享模式下，预先生成分享图片
        if (!this.data.isShareMode) {
          this.generateShareImage(order);
        }
      } else {
        safeSetData(page, { loading: false });
      }
    } catch (err: unknown) {
      if (!page._pageHidden) {
        const msg = err instanceof Error ? err.message : '加载订单详情失败';
        wx.showToast({ title: msg, icon: 'none' });
        safeSetData(page, { loading: false });
      }
    }
  },

  // --- Share Image Generation (Canvas) ---
  generateShareImage(order: ProductOrder) {
    const info: ShareImageInfo = {
      orderNo: maskOrderNo(order.orderNo),
      orderName: order.orderName,
      createdAt: order.createdAt || '',
      items: (order.items || []).map(i => ({
        productName: i.productName,
        price: i.price,
        quantity: i.quantity,
      })),
      totalAmount: order.totalAmount,
      receiverName: maskName(order.receiverName),
      receiverPhone: maskPhone(order.receiverPhone),
      receiverAddress: maskAddress(order.receiverAddress),
    };

    const query = wx.createSelectorQuery?.();
    if (!query) return;

    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = SHARE_CANVAS_WIDTH * dpr;
        canvas.height = SHARE_CANVAS_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        this.drawShareCard(ctx, info, () => {
          wx.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width: SHARE_CANVAS_WIDTH * dpr,
            height: SHARE_CANVAS_HEIGHT * dpr,
            destWidth: SHARE_CANVAS_WIDTH,
            destHeight: SHARE_CANVAS_HEIGHT,
            success: (fileRes) => {
              this.setData({ shareImagePath: fileRes.tempFilePath });
            },
            fail: () => {
              console.warn('canvasToTempFilePath failed');
            },
          });
        });
      });
  },

  drawShareCard(
    ctx: any,
    info: ShareImageInfo,
    cb: () => void,
  ) {
    const W = SHARE_CANVAS_WIDTH;
    const H = SHARE_CANVAS_HEIGHT;
    const PAD = 24;

    // 背景
    ctx.fillStyle = '#f5f6f8';
    ctx.fillRect(0, 0, W, H);

    // 白色卡片
    const cardX = 16;
    const cardY = 16;
    const cardW = W - 32;
    ctx.fillStyle = '#ffffff';
    this.drawRoundRect(ctx, cardX, cardY, cardW, H - 32, 12);
    ctx.fill();

    let y = cardY + PAD;

    // 顶部：订单状态标签
    ctx.fillStyle = '#07C160';
    this.drawRoundRect(ctx, cardX + PAD, y - 4, 72, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText('订单分享', cardX + PAD + 10, y + 14);

    y += 48;

    // 订单编号 & 下单时间
    ctx.fillStyle = '#999999';
    ctx.font = '11px sans-serif';
    ctx.fillText('订单编号：' + info.orderNo, cardX + PAD, y + 12);
    if (info.createdAt) {
      ctx.fillText('下单时间：' + info.createdAt, cardX + PAD + 200, y + 12);
    }
    y += 30;

    // 分割线
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + PAD, y);
    ctx.lineTo(cardX + cardW - PAD, y);
    ctx.stroke();
    y += 20;

    // 商品列表
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('商品清单', cardX + PAD, y);
    y += 30;

    const maxItems = Math.min(info.items.length, 3);
    for (let i = 0; i < maxItems; i++) {
      const item = info.items[i];
      ctx.fillStyle = '#333333';
      ctx.font = '12px sans-serif';
      // 商品名（截断）
      const name = item.productName.length > 14 ? item.productName.substring(0, 14) + '…' : item.productName;
      ctx.fillText(name, cardX + PAD, y);

      // 价格右对齐
      const priceText = '¥' + item.price.toFixed(2) + ' ×' + item.quantity;
      ctx.fillStyle = '#FF6B35';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(priceText, cardX + cardW - PAD, y);
      ctx.textAlign = 'left';

      y += 24;
    }
    if (info.items.length > 3) {
      ctx.fillStyle = '#999';
      ctx.font = '11px sans-serif';
      ctx.fillText('... 等共' + info.items.length + '件商品', cardX + PAD, y);
      y += 22;
    }

    y += 6;
    // 分割线
    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(cardX + PAD, y);
    ctx.lineTo(cardX + cardW - PAD, y);
    ctx.stroke();
    y += 18;

    // 收货信息（打码）
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('收货信息（隐私加密）', cardX + PAD, y);
    y += 26;

    const maskLines = [
      { label: '收货人', value: info.receiverName },
      { label: '联系电话', value: info.receiverPhone },
      { label: '收货地址', value: info.receiverAddress },
    ];
    maskLines.forEach((line) => {
      ctx.fillStyle = '#999999';
      ctx.font = '11px sans-serif';
      ctx.fillText(line.label, cardX + PAD, y);
      ctx.fillStyle = '#666666';
      ctx.fillText(line.value, cardX + PAD + 72, y);
      y += 22;
    });

    y += 8;
    // 分割线
    ctx.strokeStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(cardX + PAD, y);
    ctx.lineTo(cardX + cardW - PAD, y);
    ctx.stroke();
    y += 20;

    // 合计
    ctx.fillStyle = '#333333';
    ctx.font = '14px sans-serif';
    ctx.fillText('合计', cardX + PAD, y + 4);

    ctx.fillStyle = '#FF6B35';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('¥' + (typeof info.totalAmount === 'number' ? info.totalAmount.toFixed(2) : info.totalAmount), cardX + cardW - PAD, y + 4);
    ctx.textAlign = 'left';

    y += 40;

    // 底部提示
    ctx.fillStyle = '#999999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('长按识别小程序码查看订单详情', W / 2, y);
    ctx.textAlign = 'left';

    cb();
  },

  drawRoundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // --- Share Actions ---

  onShareOrder() {
    if (!this.data.order) return;
    // 触发微信原生分享面板
    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage'],
    });
    wx.showToast({ title: '请点击右上角分享', icon: 'none' });
  },

  onShareAppMessage() {
    const order = this.data.order;
    if (!order) {
      return {
        title: '安伴适老好物',
        path: '/pages/suitable-products/index',
      };
    }
    const sharePath = `/pages/suitable-products/detail?id=${order.id}&share=1`;

    const res: Record<string, any> = {
      title: `${order.orderName} - 安伴适老好物`,
      path: sharePath,
    };

    // 如果已生成分享图，使用自定义图片
    if (this.data.shareImagePath) {
      res.imageUrl = this.data.shareImagePath;
    }

    return res;
  },
});
