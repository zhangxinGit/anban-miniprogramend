import { getOrderDetail, ORDER_STATUS_MAP } from '../../services/suitableProducts';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { offlineFirst, cacheForOffline } from '../../utils/offlineCache';

// --- Privacy Mask Utilities ---
function maskName(name) {
  if (!name) return '***';
  if (name.length === 1) return '*';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(Math.min(name.length - 2, 2)) + name[name.length - 1];
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return '****';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

function maskAddress(address) {
  if (!address) return '**';
  var matched = address.match(/^(.{2,}?(?:省|市|区|县|镇|乡|旗))/);
  if (matched) return matched[0] + '****';
  return address.substring(0, Math.min(6, address.length)) + '****';
}

function maskOrderNo(orderNo) {
  if (!orderNo || orderNo.length < 8) return '****';
  return orderNo.substring(0, 5) + '****' + orderNo.substring(orderNo.length - 3);
}

function getStatusMeta(status) {
  return ORDER_STATUS_MAP[status] || { text: status || '未知', class: 'status-unknown' };
}

function orderCacheKey(id) {
  return 'ab_offline_suitable_order_' + id;
}

var SHARE_CANVAS_WIDTH = 500;
var SHARE_CANVAS_HEIGHT = 580;

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    statusText: '',
    statusClass: '',
    isShareMode: false,
    maskedReceiverName: '',
    maskedReceiverPhone: '',
    maskedReceiverAddress: '',
    maskedOrderNo: '',
    shareImagePath: '',
  },

  onLoad: function (options) {
    var id = options ? options.id : undefined;
    var share = options ? options.share : undefined;
    if (!id) {
      wx.showToast({ title: '缺少订单ID', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }
    this.setData({ orderId: id, isShareMode: share === '1' });
    this.loadOrderDetail();
  },

  onUnload: function () {
    markPageDead(this);
  },

  onHide: function () {
    markPageDead(this);
  },

  onShow: function () {
    markPageAlive(this);
  },

  loadOrderDetail: function () {
    var _this = this;
    var page = this;
    this.setData({ loading: true });
    try {
      var cacheKey = orderCacheKey(this.data.orderId);
      offlineFirst(cacheKey, function () { return getOrderDetail(_this.data.orderId); }, {
        ttlMs: 10 * 60000,
        staleMessage: '网络异常，正在查看离线订单',
      }).then(function (result) {
        if (page._pageHidden) return;
        if (result) {
          var raw = result.data;
          var order = Object.assign({}, raw, {
            items: (raw.items || []).map(function (item) {
              return Object.assign({}, item, {
                subtotal: ((item.price || 0) * (item.quantity || 0)).toFixed(2),
              });
            }),
          });
          var statusMeta = getStatusMeta(order.status);
          var maskedReceiverName = maskName(order.receiverName);
          var maskedReceiverPhone = maskPhone(order.receiverPhone);
          var maskedReceiverAddress = maskAddress(order.receiverAddress);
          var maskedOrderNo = maskOrderNo(order.orderNo);

          safeSetData(page, {
            order: order,
            loading: false,
            statusText: statusMeta.text,
            statusClass: statusMeta.class,
            maskedReceiverName: maskedReceiverName,
            maskedReceiverPhone: maskedReceiverPhone,
            maskedReceiverAddress: maskedReceiverAddress,
            maskedOrderNo: maskedOrderNo,
          });

          if (result.fresh) {
            cacheForOffline(cacheKey, order, 10 * 60000);
          }

          if (!_this.data.isShareMode) {
            _this.generateShareImage(order);
          }
        } else {
          safeSetData(page, { loading: false });
        }
      }).catch(function (err) {
        if (!page._pageHidden) {
          var msg = err instanceof Error ? err.message : '加载订单详情失败';
          wx.showToast({ title: msg, icon: 'none' });
          safeSetData(page, { loading: false });
        }
      });
    } catch (err) {
      if (!page._pageHidden) {
        var msg = err instanceof Error ? err.message : '加载订单详情失败';
        wx.showToast({ title: msg, icon: 'none' });
        safeSetData(page, { loading: false });
      }
    }
  },

  generateShareImage: function (order) {
    var _this = this;
    var info = {
      orderNo: maskOrderNo(order.orderNo),
      orderName: order.orderName,
      createdAt: order.createdAt || '',
      items: (order.items || []).map(function (i) {
        return { productName: i.productName, price: i.price, quantity: i.quantity };
      }),
      totalAmount: order.totalAmount,
      receiverName: maskName(order.receiverName),
      receiverPhone: maskPhone(order.receiverPhone),
      receiverAddress: maskAddress(order.receiverAddress),
    };

    var query = wx.createSelectorQuery ? wx.createSelectorQuery() : null;
    if (!query) return;

    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return;
        var canvas = res[0].node;
        var ctx = canvas.getContext('2d');
        var dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = SHARE_CANVAS_WIDTH * dpr;
        canvas.height = SHARE_CANVAS_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        _this.drawShareCard(ctx, info, function () {
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: SHARE_CANVAS_WIDTH * dpr,
            height: SHARE_CANVAS_HEIGHT * dpr,
            destWidth: SHARE_CANVAS_WIDTH,
            destHeight: SHARE_CANVAS_HEIGHT,
            success: function (fileRes) {
              _this.setData({ shareImagePath: fileRes.tempFilePath });
            },
            fail: function () {
              console.warn('canvasToTempFilePath failed');
            },
          });
        });
      });
  },

  drawShareCard: function (ctx, info, cb) {
    var W = SHARE_CANVAS_WIDTH;
    var H = SHARE_CANVAS_HEIGHT;
    var PAD = 24;

    // 背景
    ctx.fillStyle = '#f5f6f8';
    ctx.fillRect(0, 0, W, H);

    // 白色卡片
    var cardX = 16;
    var cardY = 16;
    var cardW = W - 32;
    ctx.fillStyle = '#ffffff';
    drawRoundRect(ctx, cardX, cardY, cardW, H - 32, 12);
    ctx.fill();

    var y = cardY + PAD;

    // 顶部标签
    ctx.fillStyle = '#07C160';
    drawRoundRect(ctx, cardX + PAD, y - 4, 72, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText('订单分享', cardX + PAD + 10, y + 14);

    y += 48;

    // 订单编号 & 时间
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

    // 商品清单标题
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('商品清单', cardX + PAD, y);
    y += 30;

    // 商品列表
    var maxItems = Math.min(info.items.length, 3);
    for (var i = 0; i < maxItems; i++) {
      var item = info.items[i];
      ctx.fillStyle = '#333333';
      ctx.font = '12px sans-serif';
      var name = item.productName.length > 14 ? item.productName.substring(0, 14) + '…' : item.productName;
      ctx.fillText(name, cardX + PAD, y);

      var priceText = '¥' + item.price.toFixed(2) + ' ×' + item.quantity;
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

    // 收货信息
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('收货信息（隐私加密）', cardX + PAD, y);
    y += 26;

    var maskLines = [
      { label: '收货人', value: info.receiverName },
      { label: '联系电话', value: info.receiverPhone },
      { label: '收货地址', value: info.receiverAddress },
    ];
    maskLines.forEach(function (line) {
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

  onShareOrder: function () {
    if (!this.data.order) return;
    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage'],
    });
    wx.showToast({ title: '请点击右上角分享', icon: 'none' });
  },

  onShareAppMessage: function () {
    var order = this.data.order;
    if (!order) {
      return { title: '安伴适老好物', path: '/pages/suitable-products/index' };
    }
    var sharePath = '/pages/suitable-products/detail?id=' + order.id + '&share=1';
    var res = {
      title: order.orderName + ' - 安伴适老好物',
      path: sharePath,
    };
    if (this.data.shareImagePath) {
      res.imageUrl = this.data.shareImagePath;
    }
    return res;
  },
});

function drawRoundRect(ctx, x, y, w, h, r) {
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
}
