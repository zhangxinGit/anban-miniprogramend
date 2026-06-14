import { roleStore } from '../../store/roleStore';
import { USER_ROLES, type UserRole } from '../../shared/roles';
import { canAccess } from '../../utils/acl';
import { isDealed } from '../../utils/permission';
import type { DeviceAlarmRecord } from '../../services/deviceCenter';
import { createServiceBooking } from '../../services/serviceBooking';
import {
  formatTime,
  getFamilyNoticePage,
  getMessageDeviceAlarmPage,
  getSystemNoticePage,
  getUnreadStat,
  markMessageRead,
  type FamilyNotice,
  type SystemNotice,
} from '../../services/messageCenter';
import { fetchServiceCatalogPage, rememberServiceItems, type ServiceCatalogItem } from '../service-market/catalog';
import { showAppModal } from '../../utils/modal';
import { promptLogin } from '../../utils/loginGate';
import { getErrorMessage } from '../../utils/errorMessage';

const PAGE_SIZE = 50;

const QUICK_FILTERS = [
  { key: 'ALL', label: '全部消息' },
  { key: 'TODAY', label: '今日消息' },
  { key: 'THREE_DAYS', label: '近3天消息' },
  { key: 'PENDING', label: '待处理消息' },
] as const;

const HELP_TYPE_OPTIONS = [
  { value: 'ALL', label: '全部类型' },
  { value: '一键求助', label: '一键求助' },
  { value: '跌倒告警', label: '跌倒告警' },
  { value: '设备故障', label: '设备故障' },
] as const;

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PENDING', label: '待处理' },
  { value: 'UNREAD', label: '未读' },
  { value: 'CLOSED', label: '已办结/已读' },
] as const;

type Tab = 'SYSTEM_CS' | 'DEVICE_ALARM' | 'FAMILY';
type QuickFilter = (typeof QUICK_FILTERS)[number]['key'];
type HelpTypeFilter = (typeof HELP_TYPE_OPTIONS)[number]['value'];
type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

type MessageStatusBadge = {
  text: string;
  className: string;
};

type MessageQuickActionKey = 'call' | 'markRead' | 'openDevice' | 'createBooking';

type MessageQuickAction = {
  key: MessageQuickActionKey;
  text: string;
  className: 'primary' | 'secondary';
};

type MessageViewItem = {
  id: string;
  type: Tab;
  deviceId?: string;
  sourceEventKey?: string;
  elderName: string;
  elderPhone: string;
  address: string;
  helpTypeLabel: string;
  title: string;
  desc: string;
  rawContent: string;
  createdAt: number;
  timeText: string;
  read: boolean;
  businessStatus: 'pending' | 'closed';
  categoryText: string;
  categoryClass: string;
  statusBadges: MessageStatusBadge[];
  quickActions: MessageQuickAction[];
};

type FilterForm = {
  startDate: string;
  endDate: string;
  helpType: HelpTypeFilter;
  status: StatusFilter;
  addressKeyword: string;
};

type PageInstance = {
  __rawItems: MessageViewItem[];
  __unsub?: () => void;
  __alarmServiceCatalogItem?: ServiceCatalogItem | null;
  __alarmServiceCatalogPromise?: Promise<ServiceCatalogItem | null>;
  getTabBar?: () => {
    setUnread?: (count: number) => void;
    setSelectedByRoute?: () => void;
  } | undefined;
};

function normalizeRequestedTab(tab: string, showDealedTabs: boolean): Tab {
  const value = String(tab || '').trim().toUpperCase();
  if (value === 'SYSTEM_CS') return 'SYSTEM_CS';
  // 如果 URL 明确指定了 DEVICE_ALARM 或 FAMILY，始终尊重用户意图（无论权限如何）
  if (value === 'DEVICE_ALARM') return 'DEVICE_ALARM';
  if (value === 'FAMILY') return 'FAMILY';
  return showDealedTabs ? 'DEVICE_ALARM' : 'SYSTEM_CS';
}

function fallbackTabPath(role: UserRole) {
  return isDealed(role) ? '/pages/service/index' : '/pages/home/index';
}

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeHelpTypeLabel(value: string, title?: string): string {
  const text = normalizeText(value) || normalizeText(title) || '告警提醒';
  if (text.includes('跌倒')) return '跌倒告警';
  if (text.includes('故障') || text.includes('异常')) return '设备故障';
  if (text.includes('一键求助') || text.includes('求助') || text.includes('SOS')) return '一键求助';
  return text;
}

function scoreAlarmServiceCatalogItem(item: ServiceCatalogItem): number {
  const haystack = [item.moduleTitle, item.serviceName, ...item.tagList].join(' ').toLowerCase();
  let score = 0;
  if (haystack.includes('隐患排查')) score += 10;
  if (haystack.includes('安全隐患')) score += 9;
  if (haystack.includes('居家安全')) score += 8;
  if (haystack.includes('上门评估')) score += 8;
  if (haystack.includes('安全评估')) score += 7;
  if (haystack.includes('评估')) score += 3;
  if (haystack.includes('排查')) score += 3;
  if (haystack.includes('上门')) score += 2;
  if (haystack.includes('安全')) score += 2;
  if (haystack.includes('保洁') || haystack.includes('焕新') || haystack.includes('清洁') || haystack.includes('厨房')) {
    score -= 6;
  }
  return score;
}

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function endOfDate(dateText: string): number {
  const parsed = Date.parse(`${dateText}T23:59:59`);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function startOfDate(dateText: string): number {
  const parsed = Date.parse(`${dateText}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildStatusBadges(type: Tab, read: boolean, businessStatus: 'pending' | 'closed'): MessageStatusBadge[] {
  const badges: MessageStatusBadge[] = [];
  if (businessStatus === 'pending') {
    badges.push({ text: '待处理', className: 'danger' });
  }
  if (type !== 'DEVICE_ALARM' && !read) {
    badges.push({ text: '未读', className: 'warning' });
  }
  if (badges.length === 0) {
    badges.push({ text: type === 'DEVICE_ALARM' ? '已办结' : '已读/已闭环', className: 'muted' });
  }
  return badges;
}

function buildFamilyDesc(helpTypeLabel: string, content: string): string {
  if (content) return content;
  if (helpTypeLabel === '一键求助') return '老人发起求助，建议电话确认';
  if (helpTypeLabel === '跌倒告警') return '检测到疑似跌倒，建议立即电话确认';
  if (helpTypeLabel === '设备故障') return '老人侧设备有异常，建议尽快电话确认';
  return '老人侧触发预警，建议尽快电话确认';
}

function buildSystemDesc(helpTypeLabel: string, content: string): string {
  if (content) return content;
  if (helpTypeLabel === '一键求助') return '已收录求助，平台跟进处置';
  if (helpTypeLabel === '跌倒告警') return '已收录跌倒风险，平台跟进处置';
  if (helpTypeLabel === '设备故障') return '已收录设备异常，平台跟进处置';
  return '已收录预警，平台跟进处置';
}

function buildAlarmDesc(): string {
  return '可快捷查看设备详情，或发起上门核查工单';
}

function buildFamilyItem(item: FamilyNotice): MessageViewItem {
  const helpTypeLabel = normalizeHelpTypeLabel(item.helpTypeLabel || '', item.title);
  const businessStatus = item.businessStatus === 'closed' ? 'closed' : 'pending';
  const elderPhone = normalizeText(item.elderPhone);
  return {
    id: item.id,
    type: 'FAMILY',
    sourceEventKey: item.sourceEventKey,
    elderName: normalizeText(item.elderName) || '老人',
    elderPhone,
    address: normalizeText(item.address) || '住址待补充',
    helpTypeLabel,
    title: normalizeText(item.title) || helpTypeLabel,
    desc: buildFamilyDesc(helpTypeLabel, normalizeText(item.content)),
    rawContent: normalizeText(item.content),
    createdAt: item.createdAt,
    timeText: formatTime(item.createdAt),
    read: Boolean(item.read),
    businessStatus,
    categoryText: '家庭通知',
    categoryClass: 'family',
    statusBadges: buildStatusBadges('FAMILY', Boolean(item.read), businessStatus),
    quickActions: elderPhone
      ? [{ key: 'call', text: '拨打电话', className: 'secondary' }]
      : (!item.read ? [{ key: 'markRead', text: '标记已读', className: 'secondary' }] : []),
  };
}

function buildSystemItem(item: SystemNotice): MessageViewItem {
  const helpTypeLabel = normalizeHelpTypeLabel(item.helpTypeLabel || '', item.title);
  const businessStatus = item.businessStatus === 'closed' ? 'closed' : 'pending';
  return {
    id: item.id,
    type: 'SYSTEM_CS',
    sourceEventKey: item.sourceEventKey,
    elderName: normalizeText(item.elderName) || '老人',
    elderPhone: normalizeText(item.elderPhone),
    address: normalizeText(item.address) || '住址待补充',
    helpTypeLabel,
    title: normalizeText(item.title) || helpTypeLabel,
    desc: buildSystemDesc(helpTypeLabel, normalizeText(item.content)),
    rawContent: normalizeText(item.content),
    createdAt: item.createdAt,
    timeText: formatTime(item.createdAt),
    read: Boolean(item.read),
    businessStatus,
    categoryText: '系统客服',
    categoryClass: 'system',
    statusBadges: buildStatusBadges('SYSTEM_CS', Boolean(item.read), businessStatus),
    quickActions: item.read ? [] : [{ key: 'markRead', text: '标记已读', className: 'secondary' }],
  };
}

function buildAlarmItem(item: DeviceAlarmRecord): MessageViewItem {
  const businessStatus = item.handled ? 'closed' : 'pending';
  const helpTypeLabel = normalizeHelpTypeLabel(item.helpTypeLabel || item.title, item.title);
  const quickActions: MessageQuickAction[] = [];
  if (item.deviceId && item.deviceId !== 'GLOBAL') {
    quickActions.push({ key: 'openDevice', text: '查看设备', className: 'secondary' });
  }
  if (businessStatus === 'pending') {
    quickActions.push({ key: 'createBooking', text: '创建工单', className: 'primary' });
  }
  return {
    id: item.id,
    type: 'DEVICE_ALARM',
    deviceId: item.deviceId,
    sourceEventKey: item.sourceEventKey,
    elderName: normalizeText(item.elderName) || '老人',
    elderPhone: '',
    address: normalizeText(item.address) || '住址待补充',
    helpTypeLabel,
    title: normalizeText(item.title) || helpTypeLabel,
    desc: buildAlarmDesc(),
    rawContent: normalizeText(item.detail),
    createdAt: item.createdAt,
    timeText: formatTime(item.createdAt),
    read: item.handled,
    businessStatus,
    categoryText: '告警值守',
    categoryClass: 'alarm',
    statusBadges: buildStatusBadges('DEVICE_ALARM', item.handled, businessStatus),
    quickActions,
  };
}

function sortItems(items: MessageViewItem[], tab: Tab): MessageViewItem[] {
  return [...items].sort((left, right) => {
    if (tab === 'DEVICE_ALARM') {
      const pendingDiff = Number(left.businessStatus === 'closed') - Number(right.businessStatus === 'closed');
      if (pendingDiff !== 0) return pendingDiff;
    }
    if (tab === 'FAMILY') {
      const familyClosedDiff = Number(left.businessStatus === 'closed') - Number(right.businessStatus === 'closed');
      if (familyClosedDiff !== 0) return familyClosedDiff;
    }
    if (tab !== 'DEVICE_ALARM') {
      const unreadDiff = Number(left.read) - Number(right.read);
      if (unreadDiff !== 0) return unreadDiff;
    }
    return right.createdAt - left.createdAt;
  });
}

function buildFilterSummary(quickFilter: QuickFilter, filterForm: FilterForm): string {
  const parts: string[] = [];
  if (quickFilter === 'TODAY') parts.push('今日消息');
  if (quickFilter === 'THREE_DAYS') parts.push('近3天消息');
  if (quickFilter === 'PENDING') parts.push('待处理消息');
  if (filterForm.startDate || filterForm.endDate) {
    parts.push(`时间 ${filterForm.startDate || '不限'} 至 ${filterForm.endDate || '不限'}`);
  }
  if (filterForm.helpType !== 'ALL') {
    parts.push(filterForm.helpType);
  }
  if (filterForm.status !== 'ALL') {
    const option = STATUS_OPTIONS.find((item) => item.value === filterForm.status);
    parts.push(option ? option.label : filterForm.status);
  }
  if (normalizeText(filterForm.addressKeyword)) {
    parts.push(`住址含“${normalizeText(filterForm.addressKeyword)}”`);
  }
  return parts.join(' · ');
}

function matchesQuickFilter(item: MessageViewItem, quickFilter: QuickFilter): boolean {
  if (quickFilter === 'ALL') return true;
  if (quickFilter === 'TODAY') return item.createdAt >= startOfToday();
  if (quickFilter === 'THREE_DAYS') return item.createdAt >= Date.now() - 3 * 24 * 60 * 60 * 1000;
  if (quickFilter === 'PENDING') return item.businessStatus === 'pending';
  return true;
}

function matchesFilterForm(item: MessageViewItem, filterForm: FilterForm): boolean {
  if (filterForm.startDate && item.createdAt < startOfDate(filterForm.startDate)) {
    return false;
  }
  if (filterForm.endDate && item.createdAt > endOfDate(filterForm.endDate)) {
    return false;
  }
  if (filterForm.helpType !== 'ALL' && item.helpTypeLabel !== filterForm.helpType) {
    return false;
  }
  if (filterForm.status === 'PENDING' && item.businessStatus !== 'pending') {
    return false;
  }
  if (filterForm.status === 'UNREAD' && item.read) {
    return false;
  }
  if (filterForm.status === 'CLOSED' && item.businessStatus !== 'closed') {
    return false;
  }
  const addressKeyword = normalizeText(filterForm.addressKeyword);
  if (addressKeyword && !item.address.includes(addressKeyword)) {
    return false;
  }
  return true;
}

function buildEmptyText(tab: Tab, hasFilters: boolean): string {
  if (hasFilters) return '当前筛选条件下暂无消息';
  if (tab === 'DEVICE_ALARM') return '当前暂无待跟进告警';
  if (tab === 'FAMILY') return '当前暂无家庭通知';
  return '当前暂无系统客服消息';
}

Page({
  data: {
    loading: true,
    error: '',
    role: roleStore.getState().role as UserRole,
    isVisitor: roleStore.getState().role === USER_ROLES.VISITOR,
    activeTab: 'SYSTEM_CS' as Tab,
    showDealedTabs: false,
    unreadSystem: 0,
    unreadDeviceAlarm: 0,
    unreadFamily: 0,
    unreadTotal: 0,
    items: [] as MessageViewItem[],
    page: 0,
    pageSize: PAGE_SIZE,
    hasMore: false,
    loadingMore: false,
    emptyText: '暂无消息',
    quickFilters: QUICK_FILTERS,
    quickFilter: 'ALL' as QuickFilter,
    helpTypeOptions: HELP_TYPE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    filterPanelOpen: false,
    filterForm: {
      startDate: '',
      endDate: '',
      helpType: 'ALL',
      status: 'ALL',
      addressKeyword: '',
    } as FilterForm,
    filterSummary: '',
    showBulkReadAction: false,
    bulkUnreadCount: 0,
  },

  onLoad(query: Record<string, string | undefined>) {
    const role = roleStore.getState().role as UserRole;
    if (!canAccess(role, 'page.message')) {
      const tab = (this as unknown as PageInstance).getTabBar?.();
      if (tab?.setUnread) tab.setUnread(0);
      wx.switchTab({ url: fallbackTabPath(role) });
      return;
    }
    const showDealed = isDealed(role);
    const requestedTab = normalizeRequestedTab(String(query?.tab || ''), showDealed);
    (this as unknown as PageInstance).__rawItems = [] as MessageViewItem[];
    this.setData({ showDealedTabs: showDealed, activeTab: requestedTab });
    (this as unknown as PageInstance).__unsub = roleStore.subscribe((nextRole: UserRole) => {
      if (!canAccess(nextRole, 'page.message')) {
        const tab = (this as unknown as PageInstance).getTabBar?.();
        if (tab?.setUnread) tab.setUnread(0);
        wx.switchTab({ url: fallbackTabPath(nextRole) });
        return;
      }
      const showNextDealed = isDealed(nextRole);
      // 保持当前 Tab，不因角色变化而强制切换（URL 导航过来的 Tab 应被保留）
      const nextTab = this.data.activeTab;
      (this as unknown as PageInstance).__rawItems = [] as MessageViewItem[];
      this.setData({
        role: nextRole,
        isVisitor: nextRole === USER_ROLES.VISITOR,
        showDealedTabs: showNextDealed,
        activeTab: nextTab,
        page: 0,
        hasMore: false,
        loadingMore: false,
        items: [],
      });
      void this.reload();
    });
  },

  onUnload() {
    const unsub = (this as unknown as PageInstance).__unsub;
    if (typeof unsub === 'function') {
      unsub();
    }
  },

  onShow() {
    const role = roleStore.getState().role as UserRole;
    if (!canAccess(role, 'page.message')) {
      wx.switchTab({ url: fallbackTabPath(role) });
      return;
    }
    const tab = (this as unknown as PageInstance).getTabBar?.();
    if (tab?.setSelectedByRoute) {
      tab.setSelectedByRoute();
    }
    void this.reload();
  },

  async reload() {
    if (!canAccess(this.data.role, 'page.message')) {
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      // 子 API 1：未读统计（独立容错，失败不阻断列表加载）
      try {
        const stat = await getUnreadStat(this.data.role);
        const tab = (this as unknown as PageInstance).getTabBar?.();
        if (tab?.setUnread) {
          tab.setUnread(stat.total);
        }
        this.setData({
          unreadSystem: stat.system,
          unreadDeviceAlarm: stat.deviceAlarm,
          unreadFamily: stat.family,
          unreadTotal: stat.total,
        });
      } catch (statErr: any) {
        // 未读统计失败时保持默认值 0，不影响消息列表展示
        console.warn('[message] getUnreadStat failed:', statErr?.message || statErr);
      }

      // 子 API 2：消息列表（主数据，当前 tab 失败时自动降级到系统客服）
      await this.loadListByTabWithFallback(true);
      this.setData({ loading: false });
    } catch (error: any) {
      const rawMsg = typeof error?.message === 'string' ? error.message : '加载失败';
      if (rawMsg === '登录已失效，请重新登录') {
        promptLogin({
          content: '当前登录状态已失效，请重新登录后查看消息',
        });
        this.setData({ loading: false });
        return;
      }
      // 对后端通用“服务端错误”增加上下文引导
      let errorMessage = rawMsg;
      if (rawMsg === '服务端错误' || rawMsg.includes('服务端错误')) {
        const tabLabel = this.data.activeTab === 'DEVICE_ALARM' ? '告警值守'
          : this.data.activeTab === 'FAMILY' ? '家庭通知' : '系统客服';
        errorMessage = `[${tabLabel}] 服务异常，请点击下方按钮重试或切换 Tab`;
      }
      this.setData({
        loading: false,
        error: errorMessage,
      });
    }
  },

  async loadListByTab(reset = false) {
    const page = reset ? 0 : Number(this.data.page || 0) + 1;
    const pageSize = Number(this.data.pageSize || PAGE_SIZE);
    const activeTab = this.data.activeTab;
    let nextItems: MessageViewItem[] = [];
    let resultPage = page;
    let resultSize = pageSize;
    let hasMore = false;

    if (activeTab === 'SYSTEM_CS') {
      const result = await getSystemNoticePage(page, pageSize);
      nextItems = result.items.map(buildSystemItem);
      resultPage = result.page;
      resultSize = result.size;
      hasMore = result.hasMore;
    } else if (activeTab === 'FAMILY' && isDealed(this.data.role)) {
      const result = await getFamilyNoticePage(page, pageSize);
      nextItems = result.items.map(buildFamilyItem);
      resultPage = result.page;
      resultSize = result.size;
      hasMore = result.hasMore;
    } else if (activeTab === 'DEVICE_ALARM' && isDealed(this.data.role)) {
      const result = await getMessageDeviceAlarmPage(this.data.role, page, pageSize);
      nextItems = result.items.map(buildAlarmItem);
      resultPage = result.page;
      resultSize = result.size;
      hasMore = result.hasMore;
    }

    const rawItems = reset ? nextItems : [...((this as unknown as PageInstance).__rawItems || []), ...nextItems];
    (this as unknown as PageInstance).__rawItems = sortItems(rawItems, activeTab);
    this.setData({
      page: resultPage,
      pageSize: resultSize,
      hasMore,
      loadingMore: false,
    });
    this.refreshVisibleItems();
  },

  /**
   * 带降级的列表加载：当前 tab 失败时自动回退到 SYSTEM_CS tab。
   * 若降级后仍失败，错误信息会包含原始 tab 名称方便定位。
   */
  async loadListByTabWithFallback(reset = false) {
    const TAB_LABEL: Record<Tab, string> = {
      DEVICE_ALARM: '告警值守',
      FAMILY: '家庭通知',
      SYSTEM_CS: '系统客服',
    };
    try {
      await this.loadListByTab(reset);
    } catch (tabErr: any) {
      const failedTab = this.data.activeTab;
      const failedTabLabel = TAB_LABEL[failedTab] || failedTab;
      if (failedTab !== 'SYSTEM_CS') {
        console.warn('[message] tab', failedTab, 'failed, fallback to SYSTEM_CS:', tabErr?.message || tabErr);
        this.setData({ activeTab: 'SYSTEM_CS', items: [], page: 0, hasMore: false, loadingMore: false });
        (this as unknown as PageInstance).__rawItems = [] as MessageViewItem[];
        try {
          await this.loadListByTab(true);
        } catch (fallbackErr: any) {
          // 降级也失败：附带原始 tab 信息
          const fallbackMsg = typeof fallbackErr?.message === 'string' ? fallbackErr.message : '消息加载失败';
          throw new Error(`“${failedTabLabel}”及“系统客服”均加载失败：${fallbackMsg}`);
        }
      } else {
        // 当前就是系统客服：直接抛出并附带 tab 信息
        const msg = typeof tabErr?.message === 'string' ? tabErr.message : '加载失败';
        throw new Error(`“${failedTabLabel}”加载失败：${msg}`);
      }
    }
  },

  refreshVisibleItems() {
    const rawItems = ((this as unknown as PageInstance).__rawItems || []);
    const filtered = sortItems(
        rawItems.filter((item) => matchesQuickFilter(item, this.data.quickFilter) && matchesFilterForm(item, this.data.filterForm)),
        this.data.activeTab,
      );
    const filterSummary = buildFilterSummary(this.data.quickFilter, this.data.filterForm);
    const bulkUnreadCount = Math.min(filtered.filter((item) => item.type !== 'DEVICE_ALARM' && !item.read).length, 1);
    this.setData({
      items: filtered,
      filterSummary,
      emptyText: buildEmptyText(this.data.activeTab, Boolean(filterSummary)),
      showBulkReadAction: this.data.activeTab !== 'DEVICE_ALARM' && bulkUnreadCount > 0,
      bulkUnreadCount,
    });
  },

  switchTab(e: any) {
    const tab = e?.currentTarget?.dataset?.tab as Tab;
    if (!tab) {
      return;
    }
    // WXML 已通过 wx:if 控制可见 Tab，此处不再拦截；用户通过 URL 进入的 Tab 也允许手动切换
    (this as unknown as PageInstance).__rawItems = [] as MessageViewItem[];
    this.setData({ activeTab: tab, items: [], page: 0, hasMore: false, loadingMore: false });
    void this.loadListByTab(true);
  },

  onRetry() {
    void this.reload();
  },

  /**
   * 出错时手动切换到系统客服 Tab 并重试
   */
  onRetrySystemCs() {
    (this as unknown as PageInstance).__rawItems = [] as MessageViewItem[];
    this.setData({
      activeTab: 'SYSTEM_CS',
      items: [],
      page: 0,
      hasMore: false,
      loadingMore: false,
      error: '',
    });
    void this.loadListByTab(true).catch((err: any) => {
      const msg = typeof err?.message === 'string' ? err.message : '加载失败';
      this.setData({ loading: false, error: `系统客服加载失败：${msg}` });
    });
  },

  onQuickFilterTap(e: any) {
    const key = e?.currentTarget?.dataset?.key as QuickFilter;
    if (!key) {
      return;
    }
    this.setData({ quickFilter: key });
    this.refreshVisibleItems();
  },

  toggleFilterPanel() {
    this.setData({ filterPanelOpen: !this.data.filterPanelOpen });
  },

  onStartDateChange(e: any) {
    this.setData({ 'filterForm.startDate': String(e?.detail?.value || '') });
  },

  onEndDateChange(e: any) {
    this.setData({ 'filterForm.endDate': String(e?.detail?.value || '') });
  },

  onHelpTypeFilterTap(e: any) {
    const value = e?.currentTarget?.dataset?.value as HelpTypeFilter;
    if (!value) {
      return;
    }
    this.setData({ 'filterForm.helpType': value });
  },

  onStatusFilterTap(e: any) {
    const value = e?.currentTarget?.dataset?.value as StatusFilter;
    if (!value) {
      return;
    }
    this.setData({ 'filterForm.status': value });
  },

  onAddressInput(e: any) {
    this.setData({ 'filterForm.addressKeyword': String(e?.detail?.value || '') });
  },

  onApplyFilters() {
    this.setData({ filterPanelOpen: false });
    this.refreshVisibleItems();
  },

  onResetFilters() {
    this.setData({
      quickFilter: 'ALL',
      filterForm: {
        startDate: '',
        endDate: '',
        helpType: 'ALL',
        status: 'ALL',
        addressKeyword: '',
      },
    });
    this.refreshVisibleItems();
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) {
      return;
    }
    this.setData({ loadingMore: true, error: '' });
    try {
      await this.loadListByTab(false);
    } catch (error: any) {
      const errorMessage = typeof error?.message === 'string' ? error.message : '加载失败';
      if (errorMessage === '登录已失效，请重新登录') {
        promptLogin({
          content: '当前登录状态已失效，请重新登录后查看消息',
        });
      }
      this.setData({
        loadingMore: false,
        error: errorMessage,
      });
    }
  },

  onReachBottom() {
    void this.loadMore();
  },

  async resolveAlarmServiceCatalogItem(): Promise<ServiceCatalogItem | null> {
    const cached = (this as unknown as PageInstance).__alarmServiceCatalogItem;
    if (cached !== undefined) {
      return cached;
    }
    const currentPromise = (this as unknown as PageInstance).__alarmServiceCatalogPromise;
    if (currentPromise) {
      return await currentPromise;
    }
    const promise = (async () => {
      let page = 1;
      let total = 0;
      let loaded = 0;
      let bestItem: ServiceCatalogItem | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      while (page === 1 || loaded < total) {
        const result = await fetchServiceCatalogPage(page, 20);
        rememberServiceItems(result.list);
        result.list.forEach((catalogItem) => {
          const score = scoreAlarmServiceCatalogItem(catalogItem);
          if (score > bestScore) {
            bestScore = score;
            bestItem = catalogItem;
          }
        });
        total = result.total;
        loaded += result.list.length;
        if (!result.list.length) {
          break;
        }
        page += 1;
      }
      return bestScore > 0 ? bestItem : null;
    })();
    (this as unknown as PageInstance).__alarmServiceCatalogPromise = promise;
    try {
      const item = await promise;
      (this as unknown as PageInstance).__alarmServiceCatalogItem = item || null;
      return item;
    } finally {
      (this as unknown as PageInstance).__alarmServiceCatalogPromise = undefined;
    }
  },

  openDeviceDetail(item: MessageViewItem): boolean {
    if (item.type !== 'DEVICE_ALARM' || !item.deviceId || item.deviceId === 'GLOBAL') {
      return false;
    }
    wx.navigateTo({ url: `/pages/device-detail/index?id=${encodeURIComponent(item.deviceId)}` });
    return true;
  },

  async createAlarmBooking(item: MessageViewItem) {
    wx.showLoading({ title: '工单创建中' });
    try {
      const targetItem = await this.resolveAlarmServiceCatalogItem();
      if (!targetItem) {
        wx.hideLoading();
        showAppModal({
          title: '未找到排查服务',
          content: '当前服务目录里暂无适合告警处置的上门服务，已为你保留跳转入口，可手动选择服务创建工单。',
          confirmText: '去服务市场',
          cancelText: '知道了',
          success: (result) => {
            if (result.confirm) {
              wx.navigateTo({ url: '/pages/service-market/index' });
            }
          },
        });
        return;
      }
      const booking = await createServiceBooking({
        serviceCode: targetItem.id,
        serviceTitle: targetItem.serviceName,
        serviceCategory: targetItem.moduleTitle,
        locationLabel: item.address,
      });
      wx.hideLoading();
      showAppModal({
        title: '工单已创建',
        content: `已生成“${booking.serviceTitle || targetItem.serviceName}”服务工单，顾问会尽快跟进。${item.address ? `\n服务位置：${item.address}` : ''}`,
        confirmText: '查看工单',
        cancelText: '留在当前',
        success: (result) => {
          if (result.confirm) {
            wx.navigateTo({ url: '/pages/service-bookings/index' });
          }
        },
      });
    } catch (error: any) {
      wx.hideLoading();
      const message = typeof error?.message === 'string' ? error.message : '创建工单失败';
      wx.showToast({ title: message, icon: 'none' });
    }
  },

  async onBulkMarkRead() {
    const unreadItems = (this.data.items as MessageViewItem[]).filter((item) => item.type !== 'DEVICE_ALARM' && !item.read);
    if (!unreadItems.length) {
      return;
    }
    const targetItem = unreadItems[0];
    wx.showLoading({ title: '标记中' });
    try {
      await markMessageRead(String(targetItem.id));
      wx.hideLoading();
      wx.showToast({ title: '已标记 1 条为已读', icon: 'success' });
      await this.reload();
    } catch (error: unknown) {
      wx.hideLoading();
      wx.showToast({ title: getErrorMessage(error, '标记失败'), icon: 'none' });
    }
  },

  async onQuickAction(e: any) {
    const idx = Number(e?.currentTarget?.dataset?.idx);
    const action = String(e?.currentTarget?.dataset?.action || '') as MessageQuickActionKey;
    const item = Number.isFinite(idx) ? (this.data.items as MessageViewItem[])[idx] : null;
    if (!item || !action) {
      return;
    }
    if (action === 'openDevice') {
      this.openDeviceDetail(item);
      return;
    }
    if (action === 'createBooking' && item.type === 'DEVICE_ALARM') {
      await this.createAlarmBooking(item);
      return;
    }
    if (action === 'call' && item.elderPhone) {
      wx.makePhoneCall({ phoneNumber: item.elderPhone });
      return;
    }
    if (action === 'markRead' && !item.read) {
      try {
        await markMessageRead(String(item.id));
        wx.showToast({ title: '已标记已读', icon: 'success' });
        await this.reload();
      } catch (error: unknown) {
        wx.showToast({ title: getErrorMessage(error, '处理失败'), icon: 'none' });
      }
    }
  },

  async onOpen(e: any) {
    const idx = Number(e?.currentTarget?.dataset?.idx);
    const item = Number.isFinite(idx) ? (this.data.items as MessageViewItem[])[idx] : null;
    if (!item) {
      return;
    }
    if (item.type === 'DEVICE_ALARM' && this.openDeviceDetail(item)) {
      return;
    }
    if (item.type !== 'DEVICE_ALARM' && !item.read) {
      try {
        await markMessageRead(String(item.id));
        void this.reload();
      } catch {
        // ignore writeback failure for detail preview
      }
    }
    const detailLines = [
      `分类：${item.categoryText}`,
      `老人：${item.elderName}`,
      `住址：${item.address}`,
      `类型：${item.helpTypeLabel}`,
      `时间：${item.timeText}`,
      item.rawContent || item.desc,
    ].filter(Boolean);
    showAppModal({
      title: item.title || item.helpTypeLabel,
      content: detailLines.join('\n'),
      confirmText: '知道了',
      showCancel: false,
    });
  },
});
