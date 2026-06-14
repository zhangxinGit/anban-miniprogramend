import { roleStore } from '../../store/roleStore';
import { USER_ROLES, type UserRole } from '../../shared/roles';
import { canAccess } from '../../utils/acl';
import { isDealed } from '../../utils/permission';
import { getToken } from '../../utils/auth';
import {
  formatTime as formatMessageTime,
  getDeviceAlarms,
  getFamilyNoticePage,
  getSystemNoticePage,
  type FamilyNotice,
  type SystemNotice,
} from '../../services/messageCenter';
import { getDeviceList, initiateEmergencyHelp, recordEmergencyHelp, type SosTicketResult } from '../../services/deviceCenter';
import { getCurrentServiceBooking } from '../../services/serviceBooking';
import { getHomeBanners, type HomeBannerCard } from '../../services/homeBanners';
import { getHomeKingKong, type HomeKingKongCard } from '../../services/homeKingKong';
import { getHomeBenefits, type HomeBenefitCard } from '../../services/homeBenefit';
import { showAppModal } from '../../utils/modal';
import { requireLogin } from '../../utils/loginGate';
import { getCache, setCache, setVersionedCache, getVersionedCacheAny, isVersionedCacheFresh } from '../../utils/cache';
import { fetchConfigVersions, getCachedVersions, needsRefresh, type ConfigVersions } from '../../services/configVersions';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import {
  consumeAssessmentPopup,
  markAssessmentPopup,
  clearAssessmentPopup,
  shouldShowPopupForLoggedInUser,
  recordPopupShown,
  markSessionClosed,
  isAssessmentCompleted,
  isSessionClosed,
  syncAssessmentCompletedFromServer,
} from '../../utils/assessmentPopup';
import { getErrorMessage } from '../../utils/errorMessage';

type HomeTargetKind = 'service-detail' | 'device-page' | 'service-page' | 'safety-check-page';

type BannerCard = {
    id: string;
    tag: string;
    title: string;
    subtitle: string;
    note: string;
    toneClass: string;
    imageClass?: string;
  imageSrc: string;
  routeMode: 'NONE' | 'NAVIGATE' | 'SWITCH_TAB';
  routeUrl: string;
  };

  type MessageCardAction = 'alarm' | 'help' | 'notice';

  type MessageCard = {
    id: string;
    title: string;
    iconText: string;
    accentClass: string;
    action: MessageCardAction;
    showDot: boolean;
    iconSrc: string;
    items: string[];
    emptyText: string;
    footerText: string;
  };

  type FeatureCard = {
    id: string;
    title: string;
    subtitle: string;
    actionText: string;
    imageSrc: string;
    imageClass?: string;
    accentClass: string;
    targetKind: HomeTargetKind;
    targetValue: string;
  };

  type BenefitCard = {
    id: string;
    kicker: string;
    title: string;
    desc: string;
    serviceId: string;
    accentClass: string;
  };

  type CaseCard = {
    id: string;
    meta: string;
    title: string;
    desc: string;
    accentClass: string;
    imageSrc: string;
    serviceId: string;
  };

  type AlarmPreviewSource = {
    deviceId: string;
    title: string;
    handled: boolean;
    createdAt: number;
  };

  type PagedResult<T> = {
    items: T[];
  };

  type PageWithUnsub = {
    __unsub?: () => void;
    getTabBar?: () => {
      setSelectedByRoute?: () => void;
    } | undefined;
  };

  type BannerTapEvent = {
    currentTarget?: {
      dataset?: {
        routeMode?: string;
        routeUrl?: string;
      };
    };
  };

  type BannerChangeEvent = {
    detail?: {
      current?: number;
    };
  };

  type BannerSelectEvent = {
    currentTarget?: {
      dataset?: {
        index?: number | string;
      };
    };
  };

  type MessageCardEvent = {
    currentTarget?: {
      dataset?: {
        action?: MessageCardAction;
      };
    };
  };

  type FeatureCardEvent = {
    currentTarget?: {
      dataset?: {
        targetKind?: HomeTargetKind;
        targetValue?: string;
      };
    };
  };

  type BenefitCardEvent = {
    currentTarget?: {
      dataset?: {
        serviceId?: string;
      };
    };
  };

  const HOTLINE_PHONE = '18526209432';
  const SERVICE_PAGE_PATH = '/pages/service-market/index';
  const DEVICE_PAGE_PATH = '/pages/service/index';
  const SAFETY_CHECK_PAGE_PATH = '/pages/safety-check/index';
  const SERVICE_IDS = {
    safetyAssessment: '1',
    bathroomRenovation: '2',
    bedroomLighting: '3',
    smartGuard: '4',
    wholeHouseCleaning: '5',
    kitchenCleaning: '6',
  } as const;

  const BANNER_CARDS: BannerCard[] = [
    {
      id: 'brand',
      tag: '安伴值守',
      title: '24 小时居家安全云端值守',
      subtitle: '把设备、求助、管家通知和上门服务入口集中到首页首屏。',
      note: '首页新版已对齐消息、设备、服务和紧急求助链路。',
      toneClass: 'brand',
      imageSrc: '/assets/home/home_banner_brand.jpg',
      routeMode: 'SWITCH_TAB',
      routeUrl: SERVICE_PAGE_PATH,
    },
    {
      id: 'science',
      tag: '防跌倒科普',
      title: '先看风险，再做改造',
      subtitle: '高频跌倒隐患、设备守护场景和上门评估入口都放进同一条浏览动线。',
      note: '点击下方入口可直接查看服务方案或预约上门。',
      toneClass: 'science',
      imageSrc: '/assets/home/home_service_scene_living.jpg',
      routeMode: 'NAVIGATE',
      routeUrl: buildServiceDetailUrl(SERVICE_IDS.safetyAssessment),
    },
    {
      id: 'welfare',
      tag: '小区福利',
      title: '家政福利与社区活动正在进行中',
      subtitle: '把社区专属福利、家政套餐和适老化改造活动统一展示。',
      note: '点击下方入口可查看具体服务详情，再继续发起预约。',
      toneClass: 'welfare',
      imageSrc: '/assets/home/home_service_scene_kitchen.jpg',
      routeMode: 'NAVIGATE',
      routeUrl: buildServiceDetailUrl(SERVICE_IDS.kitchenCleaning),
    },
  ];

  const FEATURE_CARDS: FeatureCard[] = [
    {
      id: 'safety-assessment',
      title: '居家安全评估',
      subtitle: '跌倒风险排查',
      actionText: '去评估',
      imageSrc: '/assets/banner/message_card_0.png',
      imageClass: 'featureServiceImageAssessment',
      accentClass: 'green',
      targetKind: 'safety-check-page',
      targetValue: '',
    },
    {
      id: 'smart-device',
      title: '智能安防设备',
      subtitle: '危险提醒防护',
      actionText: '去安装',
      imageSrc: '/assets/banner/message_card_1.png',
      imageClass: 'featureServiceImageDevice',
      accentClass: 'blue',
      targetKind: 'service-detail',
      targetValue: SERVICE_IDS.smartGuard,
    },
    {
      id: 'housekeeping',
      title: '家政便民服务',
      subtitle: '全屋到家服务',
      actionText: '去预约',
      imageSrc: '/assets/banner/message_card_2.png',
      imageClass: 'featureServiceImageHousekeeping',
      accentClass: 'orange',
      targetKind: 'service-detail',
      targetValue: SERVICE_IDS.wholeHouseCleaning,
    },
    {
      id: 'renovation',
      title: '适老化套餐',
      subtitle: '定制个性化方案',
      actionText: '去报名',
      imageSrc: '/assets/banner/message_card_3.png',
      imageClass: 'featureServiceImageRenovation',
      accentClass: 'red',
      targetKind: 'service-detail',
      targetValue: SERVICE_IDS.bathroomRenovation,
    },
  ];

  /** 将 FeatureCard 转换为 KingKongCard（兜底使用） */
  function featureCardToKingKongCard(card: FeatureCard): HomeKingKongCard {
    let routeMode: 'NONE' | 'NAVIGATE' | 'SWITCH_TAB' = 'NAVIGATE';
    let routeUrl = '';
    if (card.targetKind === 'safety-check-page') {
      routeUrl = SAFETY_CHECK_PAGE_PATH;
    } else if (card.targetKind === 'service-detail' && card.targetValue) {
      routeUrl = buildServiceDetailUrl(card.targetValue);
    } else {
      routeMode = 'SWITCH_TAB';
      routeUrl = SERVICE_PAGE_PATH;
    }
    const bgColorMap: Record<string, string> = {
      green: 'linear-gradient(135deg, #3bce7d 0%, #14b05e 100%)',
      blue: 'linear-gradient(135deg, #4b8fff 0%, #386dda 100%)',
      orange: 'linear-gradient(135deg, #ff9c4a 0%, #f17f27 100%)',
      red: 'linear-gradient(135deg, #f67a68 0%, #ea554a 100%)',
    };
    return {
      id: card.id,
      bgColor: bgColorMap[card.accentClass] || bgColorMap.green,
      title: card.title,
      subtitle: card.subtitle,
      actionText: card.actionText,
      iconSrc: card.imageSrc,
      routeMode,
      routeUrl,
    };
  }

  /** 硬编码兜底金刚区数据 */
  const FALLBACK_KINGKONG_CARDS: HomeKingKongCard[] = FEATURE_CARDS.map(featureCardToKingKongCard);

  const BENEFIT_CARDS: BenefitCard[] = [
    {
      id: 'new-resident',
      kicker: '新住户专享',
      title: '免费上门居家安全隐患排查',
      desc: '面向新住户开放免费排查名额，优先识别地面、照明、卫生间与卧室动线隐患。',
      serviceId: SERVICE_IDS.safetyAssessment,
      accentClass: 'green',
    },
    {
      id: 'cleaning',
      kicker: '小区特惠',
      title: '家政保洁套餐优惠',
      desc: '支持家政保洁类服务咨询与预约，预约页会沿用现有服务信息提交流程。',
      serviceId: SERVICE_IDS.kitchenCleaning,
      accentClass: 'orange',
    },
    {
      id: 'signing',
      kicker: '签约福利',
      title: '安防套餐签约赠送值守时长',
      desc: '签约安防套餐后可获得对应值守时长赠送，适合需要长期居家安全陪护的家庭。',
      serviceId: SERVICE_IDS.smartGuard,
      accentClass: 'blue',
    },
  ];

  const CASE_CARDS: CaseCard[] = [
    {
      id: 'living-service',
      meta: '全屋深度保洁实拍',
      title: '客厅高频接触区上门焕新',
      desc: '围绕桌面、扶手、边角落尘点位做整洁清理，让长辈活动区更清爽也更易维护。',
      accentClass: 'caseGreen',
      imageSrc: '/assets/home/home_service_scene_living.jpg',
      serviceId: SERVICE_IDS.wholeHouseCleaning,
    },
    {
      id: 'kitchen-service',
      meta: '厨房焕新保洁实拍',
      title: '灶台与水槽重油污集中处理',
      desc: '针对厨房台面、烟机与水槽边缘重污渍做深度焕新，适合节前、换季和集中清洁场景。',
      accentClass: 'caseBlue',
      imageSrc: '/assets/home/home_service_scene_kitchen.jpg',
      serviceId: SERVICE_IDS.kitchenCleaning,
    },
    {
      id: 'assessment-service',
      meta: '上门评估跟进',
      title: '评估师与管家协同完成隐患排查',
      desc: '从到家勘测到整改建议形成清单，后续可继续衔接改造或设备安装服务。',
      accentClass: 'caseOrange',
      imageSrc: '/assets/banner/contact_advisor.png',
      serviceId: SERVICE_IDS.safetyAssessment,
    },
  ];

  const initialRole = roleStore.getState().role as UserRole;

  /** 版本感知缓存键 —— 每个数据段独立缓存，支持版本比对按需刷新 */
  const V2_CACHE_KEYS = {
    /** Banner 数据 + 版本 */
    banners: 'ab_v2_home_banners',
    /** 金刚区数据 + 版本 */
    kingkong: 'ab_v2_home_kingkong',
    /** 福利专区数据 + 版本 */
    benefits: 'ab_v2_home_benefits',
    /** 服务预约管家信息 + 版本 */
    booking: 'ab_v2_home_booking',
    /** 消息卡片数据（短 TTL 缓存用于断网兜底，正常情况每次 onShow 刷新） */
    messages: 'ab_v2_home_messages',
    /** 缓存的版本 map（由 fetchConfigVersions 写入） */
    versions: 'ab_v2_home_versions',
    /** 设备数量缓存 */
    devices: 'ab_v2_home_devices',
  } as const;

  /** 兼容旧缓存键（迁移时自动读取） */
  const LEGACY_HOME_CACHE_KEY = 'ab_home_cache';
  const CACHE_TTL = {
    /** 消息卡片缓存的兜底有效期（正常情况下切 Tab 触发 refreshMessagesOnly 实时刷新） */
    messages: 30 * 1000,
  } as const;

  function emptyPage<T>(): PagedResult<T> {
    return { items: [] };
  }

  function normalizeText(value: unknown): string {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function formatPreviewLine(time: number, text: string): string {
    const prefix = normalizeText(formatMessageTime(time));
    const content = normalizeText(text);
    return [prefix, content].filter(Boolean).join(' · ');
  }

  function joinNoticeText(title: string, content: string): string {
    const normalizedTitle = normalizeText(title);
    const normalizedContent = normalizeText(content);
    if (normalizedTitle && normalizedContent && normalizedTitle !== normalizedContent) {
      return `${normalizedTitle}：${normalizedContent}`;
    }
    return normalizedTitle || normalizedContent || '最新通知';
  }

  function isEmergencyHelpNotice(notice: FamilyNotice): boolean {
    const text = `${normalizeText(notice.title)} ${normalizeText(notice.content)}`.toLowerCase();
    return text.includes('求助') || text.includes('sos') || text.includes('紧急');
  }

  function resolveAlarmBindHint(role: UserRole): string {
    return role === USER_ROLES.VISITOR ? '绑定家庭后查看告警记录' : '绑定设备后查看告警记录';
  }

  function buildAlarmCard(alarms: AlarmPreviewSource[], deviceCount: number, role: UserRole): MessageCard {
    const deviceAlarms = alarms.filter((alarm) => {
      const title = normalizeText(alarm.title);
      return alarm.deviceId !== 'GLOBAL' && !title.includes('求助');
    });
    const unreadCount = deviceAlarms.filter((alarm) => !alarm.handled).length;
    return {
      id: 'alarm',
      title: '告警动态',
      iconText: '!',
      accentClass: 'alarm',
      action: 'alarm',
      showDot: unreadCount > 0,
      iconSrc: '/assets/home/famaliy_msg3.png',
      items: deviceAlarms.slice(0, 3).map((alarm) => {
        const suffix = alarm.handled ? '已处理' : '待查看';
        return formatPreviewLine(alarm.createdAt, `${normalizeText(alarm.title)} · ${suffix}`);
      }),
      emptyText: deviceCount > 0
        ? `今日告警 0 条，已接入 ${deviceCount} 台设备在线正常`
        : resolveAlarmBindHint(role),
      footerText: deviceCount > 0 ? `已接入 ${deviceCount} 台设备` : resolveAlarmBindHint(role),
    };
  }

  function buildHelpCard(helpNotices: FamilyNotice[], isDealedUser: boolean): MessageCard {
    const unreadCount = helpNotices.filter((notice) => !notice.read).length;
    return {
      id: 'help',
      title: '紧急求助',
      iconText: 'SOS',
      accentClass: 'help',
      action: 'help',
      showDot: unreadCount > 0,
      iconSrc: '/assets/home/famaliy_msg1.png',
      items: helpNotices.slice(0, 3).map((notice) => {
        return formatPreviewLine(notice.createdAt, joinNoticeText(notice.title, notice.content));
      }),
      emptyText: isDealedUser ? '暂无紧急求助信息' : '绑定家庭后查看求助记录',
      footerText: isDealedUser ? '点击查看全部求助记录' : '绑定家庭后可查看求助记录',
    };
  }

  function buildNoticeCard(systemNotices: SystemNotice[]): MessageCard {
    const unreadCount = systemNotices.filter((notice) => !notice.read).length;
    return {
      id: 'notice',
      title: '管家通知',
      iconText: '知',
      accentClass: 'notice',
      action: 'notice',
      showDot: unreadCount > 0,
      iconSrc: '/assets/home/famaliy_msg2.png',
      items: systemNotices.slice(0, 3).map((notice) => {
        return formatPreviewLine(notice.createdAt, joinNoticeText(notice.title, notice.content));
      }),
      emptyText: '暂无管家最新通知',
      footerText: unreadCount > 0 ? `有 ${unreadCount} 条未读通知` : '社区福利与官方提醒会在这里更新',
    };
  }

  function buildServiceDetailUrl(serviceId: string): string {
    return `/pages/service-detail/index?id=${encodeURIComponent(serviceId)}`;
  }

  function openHomeTarget(targetKind: HomeTargetKind, targetValue: string) {
    if (targetKind === 'device-page') {
      wx.switchTab({ url: DEVICE_PAGE_PATH });
      return;
    }
    if (targetKind === 'safety-check-page') {
      wx.navigateTo({ url: SAFETY_CHECK_PAGE_PATH });
      return;
    }
    if (targetKind === 'service-page') {
      wx.switchTab({ url: SERVICE_PAGE_PATH });
      return;
    }
    if (!targetValue) {
      wx.switchTab({ url: SERVICE_PAGE_PATH });
      return;
    }
    wx.navigateTo({ url: buildServiceDetailUrl(targetValue) });
  }

  function openBannerRoute(routeMode: 'NONE' | 'NAVIGATE' | 'SWITCH_TAB', routeUrl: string) {
    const normalizedUrl = String(routeUrl || '').trim();
    if (!normalizedUrl || routeMode === 'NONE') {
      return;
    }
    if (!normalizedUrl.startsWith('/pages/')) {
      wx.showToast({ title: 'Banner 跳转配置无效', icon: 'none' });
      return;
    }
    if (routeMode === 'SWITCH_TAB') {
      wx.switchTab({
        url: normalizedUrl,
        fail: () => wx.showToast({ title: 'Banner 跳转失败', icon: 'none' }),
      });
      return;
    }
    wx.navigateTo({
      url: normalizedUrl,
      fail: () => wx.showToast({ title: 'Banner 跳转失败', icon: 'none' }),
    });
  }

  /**
   * Banner 去重：优先按 contentKey（title + subtitle）去重，再按 id 兜底。
   * 解决：①后端 DB 中存在内容相同但 id/imageSrc 不同的重复行；
   *       ②缓存合并时产生冗余。
   */
  function dedupeBanners(banners: HomeBannerCard[]): HomeBannerCard[] {
    const seenId = new Set<string>();
    const seenKey = new Set<string>();
    return banners.filter((b) => {
      if (!b.id) return false;
      if (seenId.has(b.id)) return false;
      seenId.add(b.id);

      const contentKey = `${b.title || ''}|${b.subtitle || ''}`;
      if (contentKey && seenKey.has(contentKey)) {
        console.log(`[dedupeBanners] 检测到内容重复（title+subtitle 相同），已过滤: id=${b.id}`);
        return false;
      }
      if (contentKey) seenKey.add(contentKey);
      return true;
    });
  }

  Page({
    /** 页面实例级 _pageDead 标记，PageGuard 通过此标记拦截后台 setData */
    _pageDead: false as boolean,

    data: {
      role: initialRole,
      isDealedUser: isDealed(initialRole),
      loading: true,
      error: '' as string,
      activeBannerIndex: 0,
      bannerCards: BANNER_CARDS,
      featureCards: FEATURE_CARDS,
      kingkongCards: FALLBACK_KINGKONG_CARDS,
      benefitCards: BENEFIT_CARDS,
      caseCards: CASE_CARDS,
      messageCards: [] as MessageCard[],
      serviceManagerName: '安伴社区管家',
      serviceManagerPhone: HOTLINE_PHONE,
      hotlinePhone: HOTLINE_PHONE,
      /** SOS 求助结果覆盖层 */
      showSosResult: false,
      sosTicket: null as SosTicketResult | null,
      /** 评估强提醒弹窗 */
      showAssessmentPopup: false,
    },

    /** 是否已完成首次全量加载，用于 onShow 判断是否需要刷新完整首页 */
    _homeInitialLoaded: false,
    /** 是否正在执行全量加载中，防止 onLoad/onShow 竞态重复请求 */
    _homeLoading: false,

    onLoad() {
      const page = this as typeof this & PageWithUnsub & { _homeInitialLoaded: boolean; _homeLoading: boolean };
      page._homeInitialLoaded = false;
      page._homeLoading = false;

      // 记录当前已知角色，避免 subscribe 立即回调与后续显式调用造成双重 loadHomeDashboard
      let knownRole = initialRole;
      page.__unsub = roleStore.subscribe((role) => {
        if (role === knownRole) return; // 角色未变，跳过（subscribe 同步回调导致）
        knownRole = role;
        this.setData({
          role,
          isDealedUser: isDealed(role),
        });
        void (this as any).loadHomeDashboard(true);
      });
      // onLoad 首次加载不 forceReload，让 Phase 0 从版本缓存同步读取实现首屏秒开
      void (this as any).loadHomeDashboard();
    },

    onHide() {
      markPageDead(this as any);
    },

    onUnload() {
      markPageDead(this as any);
      const page = this as typeof this & PageWithUnsub;
      const unsub = page.__unsub;
      if (typeof unsub === 'function') {
        unsub();
      }
    },

    onShow() {
      markPageAlive(this as any);
      const page = this as typeof this & PageWithUnsub & { _homeInitialLoaded: boolean; _homeLoading: boolean; _lastMsgRefresh: number };
      const tab = page.getTabBar?.();
      if (tab?.setSelectedByRoute) {
        tab.setSelectedByRoute();
      }

      if (page._homeLoading) {
        // 首次加载正在进行中（onLoad 已发起），避免 onShow 重复触发
        // do nothing, loadHomeDashboard 内部会在完成时设置 _homeInitialLoaded = true
      } else if (page._homeInitialLoaded) {
        // 已加载过：仅刷新家庭消息区域，5 秒内不重复刷新（节流保护）
        const now = Date.now();
        if (!page._lastMsgRefresh || now - page._lastMsgRefresh > 5000) {
          page._lastMsgRefresh = now;
          void (this as any).refreshMessagesOnly();
        }
      } else {
        // 冷启动（如小程序被后台 kill 后重新进入）：同样先读缓存秒开，后台版本比对
        void (this as any).loadHomeDashboard();
      }
      this.checkAssessmentPopup();
    },

    /**
     * 完整首页加载（首次进入 / 角色变化）
     *
     * 新版策略：分段版本感知缓存 → 首屏秒开
     * 1. 立即从 Storage 同步读取已有版本缓存数据 → setData 渲染（< 16ms）
     * 2. 后台异步拉取配置版本号，只刷新有变化的段
     * 3. 家庭消息区域始终在后台刷新（不阻塞首屏）
     *
     * @param forceReload 是否强制跳过缓存直接拉取
     */
    async loadHomeDashboard(forceReload = false) {
      const role = this.data.role as UserRole;
      const loggedIn = Boolean(getToken());
      const page = this as typeof this & PageWithUnsub & { _homeInitialLoaded: boolean; _homeLoading: boolean; _lastMsgRefresh: number };

      // 立即标记加载中，消除与 onShow 的竞态窗口
      page._homeLoading = true;

      // ===== 阶段 0：秒开渲染 —— 从版本缓存同步读取已有数据，立即上屏 =====
      let cachedBanners: HomeBannerCard[] | null = null;
      let cachedKingKong: HomeKingKongCard[] | null = null;
      let cachedBenefits: HomeBenefitCard[] | null = null;
      let cachedBooking: { managerDisplayName?: string; serviceContact?: { phone?: string } } | null = null;
      let cachedMessages: MessageCard[] | null = null;
      let usedCache = false;

      if (!forceReload) {
        // 先尝试新版版本缓存
        const bannersEntry = getVersionedCacheAny<HomeBannerCard[]>(V2_CACHE_KEYS.banners);
        const kingkongEntry = getVersionedCacheAny<HomeKingKongCard[]>(V2_CACHE_KEYS.kingkong);
        const benefitsEntry = getVersionedCacheAny<HomeBenefitCard[]>(V2_CACHE_KEYS.benefits);
        const bookingEntry = getVersionedCacheAny<{ managerDisplayName?: string; serviceContact?: { phone?: string } }>(V2_CACHE_KEYS.booking);
        const messagesEntry = getVersionedCacheAny<MessageCard[]>(V2_CACHE_KEYS.messages);

        cachedBanners = bannersEntry?.data ?? null;
        cachedKingKong = kingkongEntry?.data ?? null;
        cachedBenefits = benefitsEntry?.data ?? null;
        cachedBooking = bookingEntry?.data ?? null;
        cachedMessages = messagesEntry?.data ?? null;

        // 兼容旧版 TTL 缓存（迁移过渡期）
        if (!cachedBanners || !cachedKingKong) {
          const legacy = getCache<Record<string, unknown>>(LEGACY_HOME_CACHE_KEY);
          if (legacy) {
            const lb = legacy.banners;
            const lk = legacy.kingkongCards;
            if (!cachedBanners && Array.isArray(lb) && lb.length) cachedBanners = dedupeBanners(lb as HomeBannerCard[]);
            if (!cachedKingKong && Array.isArray(lk) && lk.length) cachedKingKong = lk as HomeKingKongCard[];
            if (!cachedBooking) {
              const lbk = legacy.booking as Record<string, unknown> | null | undefined;
              if (lbk) cachedBooking = lbk as { managerDisplayName?: string; serviceContact?: { phone?: string } };
            }
            if (!cachedMessages && Array.isArray(legacy.messageCards)) {
              cachedMessages = legacy.messageCards as MessageCard[];
            }
          }
        }

        // 有缓存数据 → 立即渲染首屏（去重后上屏）
        if (cachedBanners || cachedKingKong || cachedBenefits) {
          usedCache = true;
          const safeBanners = cachedBanners?.length ? dedupeBanners(cachedBanners) : BANNER_CARDS;
          const safeKingKong = cachedKingKong?.length ? cachedKingKong : FALLBACK_KINGKONG_CARDS;
          const safeBenefits = cachedBenefits?.length ? cachedBenefits : BENEFIT_CARDS;
          this.setData({
            loading: false,
            error: '',
            bannerCards: safeBanners,
            kingkongCards: safeKingKong,
            benefitCards: safeBenefits,
            serviceManagerName: cachedBooking?.managerDisplayName || '安伴社区管家',
            serviceManagerPhone: cachedBooking?.serviceContact?.phone || HOTLINE_PHONE,
            messageCards: cachedMessages || [],
          });
        }
      }

      // 无论有没有缓存，都立即结束骨架屏状态，让 this.data 中的静态兜底数据立刻渲染。
      // 静态 BANNER_CARDS / FALLBACK_KINGKONG_CARDS 在 Page() 初始化 data 时已赋值，
      // 与网络数据视觉一致，不存在"空白页"问题。后台网络请求完成后用 setData 增量更新。
      if (!usedCache) {
        this.setData({ loading: false, error: '' });
      }

      try {
        // ===== 阶段 1：版本比对 → 按需刷新配置数据 =====
        const self = this as any;
        let currentVersions: ConfigVersions | null = null;
        try {
          currentVersions = await fetchConfigVersions();
        } catch {
          // 版本接口失败 → 用上次缓存的版本兜底，或跳过版本检查直接全量拉取
          currentVersions = getCachedVersions();
        }

        // 并行按需刷新：Banner、金刚区、服务预约
        const refreshTasks: Promise<void>[] = [];

        // Banner
        const needBannerRefresh = forceReload
          || !currentVersions
          || needsRefresh(
              getVersionedCacheAny<HomeBannerCard[]>(V2_CACHE_KEYS.banners)?.version,
              currentVersions.banners_home,
            );
        if (needBannerRefresh) {
          refreshTasks.push((async () => {
            const fresh = await getHomeBanners().catch(() => BANNER_CARDS as HomeBannerCard[]);
            if (self._pageDead) return;
            const safeBanners = dedupeBanners(fresh.length ? fresh : BANNER_CARDS);
            const currentIndex = Number(this.data.activeBannerIndex || 0);
            const bannerCount = safeBanners.length;
            // 仅当新数据变短导致当前 index 越界时才修正 activeBannerIndex，
            // 避免在用户手动滑动过程中中断 swiper 过渡动画造成卡半张
            const needCorrectIndex = currentIndex >= bannerCount;
            safeSetData(self, {
              bannerCards: safeBanners,
              ...(needCorrectIndex ? { activeBannerIndex: 0 } : {}),
            });
            // 始终缓存，即使 currentVersions 为 null 也用兜底版本 '0_0'，
            // 确保下次 Cold Start 时 Phase 0 能立即命中缓存渲染首屏
            setVersionedCache(V2_CACHE_KEYS.banners, safeBanners, currentVersions?.banners_home ?? '0_0');
          })());
        }

        // 金刚区
        const needKingKongRefresh = forceReload
          || !currentVersions
          || needsRefresh(
              getVersionedCacheAny<HomeKingKongCard[]>(V2_CACHE_KEYS.kingkong)?.version,
              currentVersions.kingkong,
            );
        if (needKingKongRefresh) {
          refreshTasks.push((async () => {
            const fresh = await getHomeKingKong().catch(() => FALLBACK_KINGKONG_CARDS);
            if (self._pageDead) return;
            const safeKingKong = fresh.length ? fresh : FALLBACK_KINGKONG_CARDS;
            safeSetData(self, { kingkongCards: safeKingKong });
            // 始终缓存，即使 currentVersions 为 null 也用兜底版本
            setVersionedCache(V2_CACHE_KEYS.kingkong, safeKingKong, currentVersions?.kingkong ?? '0_0');
          })());
        }

        // 福利专区
        const needBenefitsRefresh = forceReload
          || !currentVersions
          || needsRefresh(
              getVersionedCacheAny<HomeBenefitCard[]>(V2_CACHE_KEYS.benefits)?.version,
              currentVersions.benefits,
            );
        if (needBenefitsRefresh) {
          refreshTasks.push((async () => {
            const fresh = await getHomeBenefits().catch(() => BENEFIT_CARDS);
            if (self._pageDead) return;
            const safeBenefits = fresh.length ? fresh : BENEFIT_CARDS;
            safeSetData(self, { benefitCards: safeBenefits });
            setVersionedCache(V2_CACHE_KEYS.benefits, safeBenefits, currentVersions?.benefits ?? '0_0');
          })());
        }

        // 服务预约（仅有登录用户才拉取）
        if (loggedIn) {
          refreshTasks.push((async () => {
            try {
              const booking = await getCurrentServiceBooking();
              if (self._pageDead) return;
              safeSetData(self, {
                serviceManagerName: booking?.managerDisplayName || '安伴社区管家',
                serviceManagerPhone: booking?.serviceContact?.phone || HOTLINE_PHONE,
              });
              setVersionedCache(V2_CACHE_KEYS.booking, {
                managerDisplayName: booking?.managerDisplayName,
                serviceContact: booking?.serviceContact,
              }, currentVersions?.banners_home ?? '0_0');
            } catch {
              // 预约加载失败不阻塞
            }
          })());
        }

        // 并行执行上述所有刷新任务
        await Promise.all(refreshTasks);

        // 首屏 Phase 0 + Phase 1 已完成，标记已加载
        // 后续 Phase 2 消息区域作为后台任务，不阻塞首屏渲染
        page._homeInitialLoaded = true;
        page._homeLoading = false;

        // ===== 阶段 2：家庭消息区域（完全后台加载，不影响首屏） =====
        // 使用 IIFE 异步执行，不阻塞当前函数返回
        const phase2Self = this as any;
        void (async () => {
          try {
            const [alarms, familyNoticePage, systemNoticePage, devices] = await Promise.all([
              loggedIn ? getDeviceAlarms(role).catch((e) => { console.error('[Phase2] getDeviceAlarms 失败:', e); return []; }) : Promise.resolve([]),
              loggedIn ? getFamilyNoticePage(0, 20).catch((e) => { console.error('[Phase2] getFamilyNoticePage 失败:', e); return emptyPage<FamilyNotice>(); }) : Promise.resolve(emptyPage<FamilyNotice>()),
              getSystemNoticePage(0, 20).catch((e) => { console.error('[Phase2] getSystemNoticePage 失败:', e); return emptyPage<SystemNotice>(); }),
              loggedIn ? getDeviceList(role).catch((e) => { console.error('[Phase2] getDeviceList 失败:', e); return []; }) : Promise.resolve([]),
            ]);

            // 页面已隐藏 → 丢弃所有结果，不 setData
            if (phase2Self._pageDead) return;

            const helpNotices = familyNoticePage.items.filter(isEmergencyHelpNotice);
            const messageCards = [
              buildAlarmCard(alarms as AlarmPreviewSource[], devices.length, role),
              buildHelpCard(helpNotices, loggedIn),
              buildNoticeCard(systemNoticePage.items),
            ];

            safeSetData(phase2Self, { messageCards });

            // 缓存设备数量（供 refreshMessagesOnly 使用）
            setVersionedCache(V2_CACHE_KEYS.devices, devices.length, currentVersions?.banners_home ?? '0_0');
            // 缓存消息卡片（短 TTL 兜底，切 Tab 回来 refreshMessagesOnly 即时刷新）
            setVersionedCache(V2_CACHE_KEYS.messages, messageCards, currentVersions?.banners_home ?? '0_0');

            // 迁移：清理旧版缓存键（平滑过渡到新版分段缓存）
            try { wx.removeStorageSync(LEGACY_HOME_CACHE_KEY); } catch { /* ignore */ }
          } catch {
            // 消息加载失败静默处理，不影响首屏
          }
        })();
      } catch (error: unknown) {
        page._homeLoading = false;
        this.setData({
          loading: false,
          error: getErrorMessage(error, '首页加载失败，请稍后重试'),
        });
      }
    },

    /**
     * 仅刷新家庭消息区域（告警动态 + 紧急求助 + 管家通知）
     * 用于从其他 Tab 切回首页时，避免不必要的全量加载
     */
    async refreshMessagesOnly() {
      const self = this as any;
      const role = this.data.role as UserRole;
      const loggedIn = Boolean(getToken());

      // 从版本缓存读取设备数量
      const deviceEntry = getVersionedCacheAny<number>(V2_CACHE_KEYS.devices);
      const deviceCount = typeof deviceEntry?.data === 'number' ? deviceEntry.data : 0;

      try {
        const [alarms, familyNoticePage, systemNoticePage] = await Promise.all([
          loggedIn ? getDeviceAlarms(role).catch(() => []) : Promise.resolve([]),
          loggedIn ? getFamilyNoticePage(0, 20).catch(() => emptyPage<FamilyNotice>()) : Promise.resolve(emptyPage<FamilyNotice>()),
          getSystemNoticePage(0, 20).catch(() => emptyPage<SystemNotice>()),
        ]);

        if (self._pageDead) return;

        const helpNotices = familyNoticePage.items.filter(isEmergencyHelpNotice);
        const messageCards = [
          buildAlarmCard(alarms as AlarmPreviewSource[], deviceCount, role),
          buildHelpCard(helpNotices, loggedIn),
          buildNoticeCard(systemNoticePage.items),
        ];

        safeSetData(self, { messageCards, error: '' });
      } catch {
        // 消息区域刷新失败静默处理，保留旧数据不遮挡用户
      }
    },

    onRetry() {
      void (this as any).loadHomeDashboard(true);
    },

    onOpenBanner(e: BannerTapEvent) {
      const routeMode = String(e?.currentTarget?.dataset?.routeMode || '').trim().toUpperCase() as 'NONE' | 'NAVIGATE' | 'SWITCH_TAB';
      const routeUrl = String(e?.currentTarget?.dataset?.routeUrl || '').trim();
      openBannerRoute(routeMode || 'NONE', routeUrl);
    },

    onBannerChange(e: BannerChangeEvent) {
      const current = Number(e?.detail?.current || 0);
      this.setData({ activeBannerIndex: current >= 0 ? current : 0 });
    },

    onSelectBanner(e: BannerSelectEvent) {
      const index = Number(e?.currentTarget?.dataset?.index || 0);
      this.setData({ activeBannerIndex: index >= 0 ? index : 0 });
    },

    /** Banner 图片加载失败时替换为本地默认图 */
    onBannerImageError(e: WechatMiniprogram.CustomEvent) {
      const index = Number(e.currentTarget.dataset.index);
      if (!Number.isFinite(index)) return;
      const banners = this.data.bannerCards.map((b, i) => {
        if (i === index && b.imageSrc && !b.imageSrc.startsWith('/assets/')) {
          return { ...b, imageSrc: '/assets/home/home_banner_brand.jpg' };
        }
        return b;
      });
      this.setData({ bannerCards: banners });
    },

    /** 金刚区图标加载失败时隐藏该图标（保留文字区域） */
    onKingKongImageError(e: WechatMiniprogram.CustomEvent) {
      const id = String(e.currentTarget.dataset.id || '');
      if (!id) return;
      const cards = this.data.kingkongCards.map((kk) => {
        if (kk.id === id) {
          return { ...kk, iconSrc: '' };
        }
        return kk;
      });
      this.setData({ kingkongCards: cards });
    },

    onOpenServicePage() {
      wx.switchTab({ url: SERVICE_PAGE_PATH });
    },

    onOpenDevicePage() {
      wx.switchTab({ url: DEVICE_PAGE_PATH });
    },

    onContactManager() {
      if (!requireLogin({
        title: '登录后联系管家',
        content: '专属管家服务仅支持登录后使用，当前可先浏览首页内容。',
      })) {
        return;
      }
      const name = normalizeText(this.data.serviceManagerName) || '安伴社区管家';
      const phone = normalizeText(this.data.serviceManagerPhone) || HOTLINE_PHONE;
      showAppModal({
        title: '联系专属管家',
        content: `将为你拨打 ${name}：${phone}`,
        confirmText: '立即拨打',
        success: (res) => {
          if (!res.confirm) {
            return;
          }
          wx.makePhoneCall({ phoneNumber: phone });
        },
      });
    },

    onOpenMessageCard(e: MessageCardEvent) {
      const action = String(e?.currentTarget?.dataset?.action || '').trim() as MessageCardAction;

      if (action === 'alarm') {
        wx.navigateTo({ url: '/pages/message/index?tab=DEVICE_ALARM' });
        return;
      }

      if (action === 'help') {
        wx.navigateTo({ url: '/pages/message/index?tab=FAMILY' });
        return;
      }

      wx.navigateTo({ url: '/pages/message/index?tab=SYSTEM_CS' });
    },

    onOpenFeature(e: FeatureCardEvent) {
      const targetKind = String(e?.currentTarget?.dataset?.targetKind || '').trim() as HomeTargetKind;
      const targetValue = String(e?.currentTarget?.dataset?.targetValue || '').trim();
      openHomeTarget(targetKind || 'service-page', targetValue);
    },

    /** 金刚区卡片点击（使用 routeMode + routeUrl，与 Banner 跳转逻辑一致） */
    onOpenKingKongRoute(e: WechatMiniprogram.BaseEvent) {
      const routeMode = String(e?.currentTarget?.dataset?.routeMode || '').trim() as 'NONE' | 'NAVIGATE' | 'SWITCH_TAB';
      const routeUrl = String(e?.currentTarget?.dataset?.routeUrl || '').trim();
      openBannerRoute(routeMode, routeUrl);
    },

    onBookBenefit(e: BenefitCardEvent) {
      const serviceId = normalizeText(e?.currentTarget?.dataset?.serviceId);
      if (!serviceId) {
        this.onOpenServicePage();
        return;
      }
      wx.navigateTo({ url: buildServiceDetailUrl(serviceId) });
    },

    onOpenCase() {
      wx.showToast({ title: '待上传，敬请期待', icon: 'none' });
    },

    onEmergencyHelp() {
      if (!requireLogin({
        title: '登录后发起求助',
        content: '紧急求助仅支持登录后发起，当前可先浏览首页内容。',
      })) {
        return;
      }
      showAppModal({
        title: '一键紧急求助',
        content: `平台将自动为您建单，安伴管家团队将优先跟进处理。是否确认发起求助？`,
        confirmText: '确认求助',
        tone: 'warning',
        success: async (modalRes) => {
          if (!modalRes.confirm) return;

          wx.showLoading({ title: '正在建单...', mask: true });
          try {
            const ticket = await initiateEmergencyHelp();
            wx.hideLoading();

            if (ticket) {
              // 展示专业工单结果页
              this.setData({ showSosResult: true, sosTicket: ticket });
            } else {
              // 离线/开发模式：简化提示
              wx.showToast({ title: '求助已发出，请保持电话畅通', icon: 'success', duration: 2500 });
            }
            void this.loadHomeDashboard();
          } catch (error: unknown) {
            wx.hideLoading();
            const message = getErrorMessage(error, '工单创建失败');
            const hotlinePhone = normalizeText(this.data.hotlinePhone) || HOTLINE_PHONE;
            showAppModal({
              title: '建单失败',
              content: `${message}。是否改为直接拨打值守专线？`,
              confirmText: '拨打热线',
              tone: 'warning',
              success: (callRes) => {
                if (callRes.confirm) {
                  wx.makePhoneCall({ phoneNumber: hotlinePhone });
                }
              },
            });
          }
        },
      });
    },

    /** 关闭 SOS 结果覆盖层 */
    onCloseSosResult() {
      this.setData({ showSosResult: false, sosTicket: null });
    },

    /** 从 SOS 结果页拨打值守热线 */
    onSosCallHotline() {
      const hotlinePhone = normalizeText(this.data.hotlinePhone) || HOTLINE_PHONE;
      wx.makePhoneCall({ phoneNumber: hotlinePhone });
    },

    /* ========== 评估强提醒弹窗 ========== */

    /** 检查是否需要弹出评估提醒（每次 onShow 调用） */
    checkAssessmentPopup() {
      const loggedIn = Boolean(getToken());

      // 先消费 app.ts 设置的 launch 信号（无论登录与否都需要消费，避免残留）
      const signal = consumeAssessmentPopup();
      const isAppLaunch = signal?.source === 'launch';

      if (loggedIn) {
        // 已登录 → 首屏秒弹
        // app launch 信号 / 热启动 onShow（已重置 sessionClosed）→ 强制弹出
        if (isAppLaunch || shouldShowPopupForLoggedInUser()) {
          recordPopupShown();
          this.setData({ showAssessmentPopup: true });
        }

        // 后台异步同步服务端状态，纠正本地与数据库不一致（如已在其他端完成测评）
        syncAssessmentCompletedFromServer().then(serverAssessed => {
          // 如果服务端标记已完成但本地刚弹了窗，则撤回弹窗
          if (serverAssessed && this.data.showAssessmentPopup) {
            this.setData({ showAssessmentPopup: false });
          }
        });
        return;
      }

      // 未登录 → 直接判断豁免条件（不依赖信号，解决热启动无信号的问题）
      if (isAssessmentCompleted()) return;
      if (isSessionClosed()) return;
      // 未登录不调用 recordPopupShown()，避免阻塞 login_retry 流程
      this.setData({ showAssessmentPopup: true });
    },

    /** 弹窗中点击「开始评估」 */
    onStartAssessmentFromPopup() {
      const loggedIn = Boolean(getToken());

      if (loggedIn) {
        // 已登录 → 直接跳转测评页
        this.setData({ showAssessmentPopup: false });
        clearAssessmentPopup();
        wx.navigateTo({ url: SAFETY_CHECK_PAGE_PATH });
      } else {
        // 未登录 → 引导去「我的」页登录，标记登录后重弹
        this.setData({ showAssessmentPopup: false });
        clearAssessmentPopup();
        markAssessmentPopup('login_retry');
        requireLogin({
          title: '登录后开始评估',
          content: '完成登录后即可开始居家安全风险自查',
          confirmText: '去登录',
          redirectMode: 'switchTab',
          redirectUrl: '/pages/mine/index',
        });
      }
    },

    /** 弹窗中点击「稍后评估」或关闭 */
    onCloseAssessmentPopup() {
      this.setData({ showAssessmentPopup: false });
      clearAssessmentPopup();
      // 标记本次会话已关闭，本次不再弹
      markSessionClosed();
    },
  });
