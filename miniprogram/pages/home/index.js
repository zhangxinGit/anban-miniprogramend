import { roleStore } from '../../store/roleStore';
import { USER_ROLES } from '../../shared/roles';
import { isDealed } from '../../utils/permission';
import { getToken } from '../../utils/auth';
import { formatTime as formatMessageTime, getDeviceAlarms, getFamilyNoticePage, getSystemNoticePage, } from '../../services/messageCenter';
import { getDeviceList, initiateEmergencyHelp } from '../../services/deviceCenter';
import { getCurrentServiceBooking } from '../../services/serviceBooking';
import { getHomeBanners } from '../../services/homeBanners';
import { getHomeKingKong } from '../../services/homeKingKong';
import { getHomeBenefits } from '../../services/homeBenefit';
import { showAppModal } from '../../utils/modal';
import { requireLogin } from '../../utils/loginGate';
import { getCache, setVersionedCache, getVersionedCacheAny } from '../../utils/cache';
import { fetchConfigVersions, getCachedVersions, needsRefresh } from '../../services/configVersions';
import { markPageDead, markPageAlive, safeSetData } from '../../utils/pageGuard';
import { consumeAssessmentPopup, markAssessmentPopup, clearAssessmentPopup, shouldShowPopupForLoggedInUser, recordPopupShown, markSessionClosed, isAssessmentCompleted, isSessionClosed, syncAssessmentCompletedFromServer, } from '../../utils/assessmentPopup';
import { getErrorMessage } from '../../utils/errorMessage';
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
};
const BANNER_CARDS = [
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
const FEATURE_CARDS = [
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
function featureCardToKingKongCard(card) {
    let routeMode = 'NAVIGATE';
    let routeUrl = '';
    if (card.targetKind === 'safety-check-page') {
        routeUrl = SAFETY_CHECK_PAGE_PATH;
    }
    else if (card.targetKind === 'service-detail' && card.targetValue) {
        routeUrl = buildServiceDetailUrl(card.targetValue);
    }
    else {
        routeMode = 'SWITCH_TAB';
        routeUrl = SERVICE_PAGE_PATH;
    }
    const bgColorMap = {
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
const FALLBACK_KINGKONG_CARDS = FEATURE_CARDS.map(featureCardToKingKongCard);
const BENEFIT_CARDS = [
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
const CASE_CARDS = [
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
const initialRole = roleStore.getState().role;
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
};
/** 兼容旧缓存键（迁移时自动读取） */
const LEGACY_HOME_CACHE_KEY = 'ab_home_cache';
const CACHE_TTL = {
    /** 消息卡片缓存的兜底有效期（正常情况下切 Tab 触发 refreshMessagesOnly 实时刷新） */
    messages: 30 * 1000,
};
function emptyPage() {
    return { items: [] };
}
function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}
function formatPreviewLine(time, text) {
    const prefix = normalizeText(formatMessageTime(time));
    const content = normalizeText(text);
    return [prefix, content].filter(Boolean).join(' · ');
}
function joinNoticeText(title, content) {
    const normalizedTitle = normalizeText(title);
    const normalizedContent = normalizeText(content);
    if (normalizedTitle && normalizedContent && normalizedTitle !== normalizedContent) {
        return `${normalizedTitle}：${normalizedContent}`;
    }
    return normalizedTitle || normalizedContent || '最新通知';
}
function isEmergencyHelpNotice(notice) {
    const text = `${normalizeText(notice.title)} ${normalizeText(notice.content)}`.toLowerCase();
    return text.includes('求助') || text.includes('sos') || text.includes('紧急');
}
function resolveAlarmBindHint(role) {
    return role === USER_ROLES.VISITOR ? '绑定家庭后查看告警记录' : '绑定设备后查看告警记录';
}
function buildAlarmCard(alarms, deviceCount, role) {
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
function buildHelpCard(helpNotices, isDealedUser) {
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
function buildNoticeCard(systemNotices) {
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
function buildServiceDetailUrl(serviceId) {
    return `/pages/service-detail/index?id=${encodeURIComponent(serviceId)}`;
}
function openHomeTarget(targetKind, targetValue) {
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
function openBannerRoute(routeMode, routeUrl) {
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
function dedupeBanners(banners) {
    const seenId = new Set();
    const seenKey = new Set();
    return banners.filter((b) => {
        if (!b.id)
            return false;
        if (seenId.has(b.id))
            return false;
        seenId.add(b.id);
        const contentKey = `${b.title || ''}|${b.subtitle || ''}`;
        if (contentKey && seenKey.has(contentKey)) {
            console.log(`[dedupeBanners] 检测到内容重复（title+subtitle 相同），已过滤: id=${b.id}`);
            return false;
        }
        if (contentKey)
            seenKey.add(contentKey);
        return true;
    });
}
Page({
    /** 页面实例级 _pageDead 标记，PageGuard 通过此标记拦截后台 setData */
    _pageDead: false,
    data: {
        role: initialRole,
        isDealedUser: isDealed(initialRole),
        loading: true,
        error: '',
        activeBannerIndex: 0,
        bannerCards: BANNER_CARDS,
        featureCards: FEATURE_CARDS,
        kingkongCards: FALLBACK_KINGKONG_CARDS,
        benefitCards: BENEFIT_CARDS,
        caseCards: CASE_CARDS,
        messageCards: [],
        serviceManagerName: '安伴社区管家',
        serviceManagerPhone: HOTLINE_PHONE,
        hotlinePhone: HOTLINE_PHONE,
        /** SOS 求助结果覆盖层 */
        showSosResult: false,
        sosTicket: null,
        /** 评估强提醒弹窗 */
        showAssessmentPopup: false,
    },
    /** 是否已完成首次全量加载，用于 onShow 判断是否需要刷新完整首页 */
    _homeInitialLoaded: false,
    /** 是否正在执行全量加载中，防止 onLoad/onShow 竞态重复请求 */
    _homeLoading: false,
    onLoad() {
        const page = this;
        page._homeInitialLoaded = false;
        page._homeLoading = false;
        // 记录当前已知角色，避免 subscribe 立即回调与后续显式调用造成双重 loadHomeDashboard
        let knownRole = initialRole;
        page.__unsub = roleStore.subscribe((role) => {
            if (role === knownRole)
                return; // 角色未变，跳过（subscribe 同步回调导致）
            knownRole = role;
            this.setData({
                role,
                isDealedUser: isDealed(role),
            });
            void this.loadHomeDashboard(true);
        });
        // onLoad 首次加载不 forceReload，让 Phase 0 从版本缓存同步读取实现首屏秒开
        void this.loadHomeDashboard();
    },
    onHide() {
        markPageDead(this);
    },
    onUnload() {
        markPageDead(this);
        const page = this;
        const unsub = page.__unsub;
        if (typeof unsub === 'function') {
            unsub();
        }
    },
    onShow() {
        var _a;
        markPageAlive(this);
        const page = this;
        const tab = (_a = page.getTabBar) === null || _a === void 0 ? void 0 : _a.call(page);
        if (tab === null || tab === void 0 ? void 0 : tab.setSelectedByRoute) {
            tab.setSelectedByRoute();
        }
        if (page._homeLoading) {
            // 首次加载正在进行中（onLoad 已发起），避免 onShow 重复触发
            // do nothing, loadHomeDashboard 内部会在完成时设置 _homeInitialLoaded = true
        }
        else if (page._homeInitialLoaded) {
            // 已加载过：仅刷新家庭消息区域，5 秒内不重复刷新（节流保护）
            const now = Date.now();
            if (!page._lastMsgRefresh || now - page._lastMsgRefresh > 5000) {
                page._lastMsgRefresh = now;
                void this.refreshMessagesOnly();
            }
        }
        else {
            // 冷启动（如小程序被后台 kill 后重新进入）：同样先读缓存秒开，后台版本比对
            void this.loadHomeDashboard();
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
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const role = this.data.role;
        const loggedIn = Boolean(getToken());
        const page = this;
        // 立即标记加载中，消除与 onShow 的竞态窗口
        page._homeLoading = true;
        // ===== 阶段 0：秒开渲染 —— 从版本缓存同步读取已有数据，立即上屏 =====
        let cachedBanners = null;
        let cachedKingKong = null;
        let cachedBenefits = null;
        let cachedBooking = null;
        let cachedMessages = null;
        let usedCache = false;
        if (!forceReload) {
            // 先尝试新版版本缓存
            const bannersEntry = getVersionedCacheAny(V2_CACHE_KEYS.banners);
            const kingkongEntry = getVersionedCacheAny(V2_CACHE_KEYS.kingkong);
            const benefitsEntry = getVersionedCacheAny(V2_CACHE_KEYS.benefits);
            const bookingEntry = getVersionedCacheAny(V2_CACHE_KEYS.booking);
            const messagesEntry = getVersionedCacheAny(V2_CACHE_KEYS.messages);
            cachedBanners = (_a = bannersEntry === null || bannersEntry === void 0 ? void 0 : bannersEntry.data) !== null && _a !== void 0 ? _a : null;
            cachedKingKong = (_b = kingkongEntry === null || kingkongEntry === void 0 ? void 0 : kingkongEntry.data) !== null && _b !== void 0 ? _b : null;
            cachedBenefits = (_c = benefitsEntry === null || benefitsEntry === void 0 ? void 0 : benefitsEntry.data) !== null && _c !== void 0 ? _c : null;
            cachedBooking = (_d = bookingEntry === null || bookingEntry === void 0 ? void 0 : bookingEntry.data) !== null && _d !== void 0 ? _d : null;
            cachedMessages = (_e = messagesEntry === null || messagesEntry === void 0 ? void 0 : messagesEntry.data) !== null && _e !== void 0 ? _e : null;
            // 兼容旧版 TTL 缓存（迁移过渡期）
            if (!cachedBanners || !cachedKingKong) {
                const legacy = getCache(LEGACY_HOME_CACHE_KEY);
                if (legacy) {
                    const lb = legacy.banners;
                    const lk = legacy.kingkongCards;
                    if (!cachedBanners && Array.isArray(lb) && lb.length)
                        cachedBanners = dedupeBanners(lb);
                    if (!cachedKingKong && Array.isArray(lk) && lk.length)
                        cachedKingKong = lk;
                    if (!cachedBooking) {
                        const lbk = legacy.booking;
                        if (lbk)
                            cachedBooking = lbk;
                    }
                    if (!cachedMessages && Array.isArray(legacy.messageCards)) {
                        cachedMessages = legacy.messageCards;
                    }
                }
            }
            // 有缓存数据 → 立即渲染首屏（去重后上屏）
            if (cachedBanners || cachedKingKong || cachedBenefits) {
                usedCache = true;
                const safeBanners = (cachedBanners === null || cachedBanners === void 0 ? void 0 : cachedBanners.length) ? dedupeBanners(cachedBanners) : BANNER_CARDS;
                const safeKingKong = (cachedKingKong === null || cachedKingKong === void 0 ? void 0 : cachedKingKong.length) ? cachedKingKong : FALLBACK_KINGKONG_CARDS;
                const safeBenefits = (cachedBenefits === null || cachedBenefits === void 0 ? void 0 : cachedBenefits.length) ? cachedBenefits : BENEFIT_CARDS;
                this.setData({
                    loading: false,
                    error: '',
                    bannerCards: safeBanners,
                    kingkongCards: safeKingKong,
                    benefitCards: safeBenefits,
                    serviceManagerName: (cachedBooking === null || cachedBooking === void 0 ? void 0 : cachedBooking.managerDisplayName) || '安伴社区管家',
                    serviceManagerPhone: ((_f = cachedBooking === null || cachedBooking === void 0 ? void 0 : cachedBooking.serviceContact) === null || _f === void 0 ? void 0 : _f.phone) || HOTLINE_PHONE,
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
            const self = this;
            let currentVersions = null;
            try {
                currentVersions = await fetchConfigVersions();
            }
            catch {
                // 版本接口失败 → 用上次缓存的版本兜底，或跳过版本检查直接全量拉取
                currentVersions = getCachedVersions();
            }
            // 并行按需刷新：Banner、金刚区、服务预约
            const refreshTasks = [];
            // Banner
            const needBannerRefresh = forceReload
                || !currentVersions
                || needsRefresh((_g = getVersionedCacheAny(V2_CACHE_KEYS.banners)) === null || _g === void 0 ? void 0 : _g.version, currentVersions.banners_home);
            if (needBannerRefresh) {
                refreshTasks.push((async () => {
                    var _a;
                    const fresh = await getHomeBanners().catch(() => BANNER_CARDS);
                    if (self._pageDead)
                        return;
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
                    setVersionedCache(V2_CACHE_KEYS.banners, safeBanners, (_a = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.banners_home) !== null && _a !== void 0 ? _a : '0_0');
                })());
            }
            // 金刚区
            const needKingKongRefresh = forceReload
                || !currentVersions
                || needsRefresh((_h = getVersionedCacheAny(V2_CACHE_KEYS.kingkong)) === null || _h === void 0 ? void 0 : _h.version, currentVersions.kingkong);
            if (needKingKongRefresh) {
                refreshTasks.push((async () => {
                    var _a;
                    const fresh = await getHomeKingKong().catch(() => FALLBACK_KINGKONG_CARDS);
                    if (self._pageDead)
                        return;
                    const safeKingKong = fresh.length ? fresh : FALLBACK_KINGKONG_CARDS;
                    safeSetData(self, { kingkongCards: safeKingKong });
                    // 始终缓存，即使 currentVersions 为 null 也用兜底版本
                    setVersionedCache(V2_CACHE_KEYS.kingkong, safeKingKong, (_a = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.kingkong) !== null && _a !== void 0 ? _a : '0_0');
                })());
            }
            // 福利专区
            const needBenefitsRefresh = forceReload
                || !currentVersions
                || needsRefresh((_j = getVersionedCacheAny(V2_CACHE_KEYS.benefits)) === null || _j === void 0 ? void 0 : _j.version, currentVersions.benefits);
            if (needBenefitsRefresh) {
                refreshTasks.push((async () => {
                    var _a;
                    const fresh = await getHomeBenefits().catch(() => BENEFIT_CARDS);
                    if (self._pageDead)
                        return;
                    const safeBenefits = fresh.length ? fresh : BENEFIT_CARDS;
                    safeSetData(self, { benefitCards: safeBenefits });
                    setVersionedCache(V2_CACHE_KEYS.benefits, safeBenefits, (_a = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.benefits) !== null && _a !== void 0 ? _a : '0_0');
                })());
            }
            // 服务预约（仅有登录用户才拉取）
            if (loggedIn) {
                refreshTasks.push((async () => {
                    var _a, _b;
                    try {
                        const booking = await getCurrentServiceBooking();
                        if (self._pageDead)
                            return;
                        safeSetData(self, {
                            serviceManagerName: (booking === null || booking === void 0 ? void 0 : booking.managerDisplayName) || '安伴社区管家',
                            serviceManagerPhone: ((_a = booking === null || booking === void 0 ? void 0 : booking.serviceContact) === null || _a === void 0 ? void 0 : _a.phone) || HOTLINE_PHONE,
                        });
                        setVersionedCache(V2_CACHE_KEYS.booking, {
                            managerDisplayName: booking === null || booking === void 0 ? void 0 : booking.managerDisplayName,
                            serviceContact: booking === null || booking === void 0 ? void 0 : booking.serviceContact,
                        }, (_b = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.banners_home) !== null && _b !== void 0 ? _b : '0_0');
                    }
                    catch {
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
            const phase2Self = this;
            void (async () => {
                var _a, _b;
                try {
                    const [alarms, familyNoticePage, systemNoticePage, devices] = await Promise.all([
                        loggedIn ? getDeviceAlarms(role).catch((e) => { console.error('[Phase2] getDeviceAlarms 失败:', e); return []; }) : Promise.resolve([]),
                        loggedIn ? getFamilyNoticePage(0, 20).catch((e) => { console.error('[Phase2] getFamilyNoticePage 失败:', e); return emptyPage(); }) : Promise.resolve(emptyPage()),
                        getSystemNoticePage(0, 20).catch((e) => { console.error('[Phase2] getSystemNoticePage 失败:', e); return emptyPage(); }),
                        loggedIn ? getDeviceList(role).catch((e) => { console.error('[Phase2] getDeviceList 失败:', e); return []; }) : Promise.resolve([]),
                    ]);
                    // 页面已隐藏 → 丢弃所有结果，不 setData
                    if (phase2Self._pageDead)
                        return;
                    const helpNotices = familyNoticePage.items.filter(isEmergencyHelpNotice);
                    const messageCards = [
                        buildAlarmCard(alarms, devices.length, role),
                        buildHelpCard(helpNotices, loggedIn),
                        buildNoticeCard(systemNoticePage.items),
                    ];
                    safeSetData(phase2Self, { messageCards });
                    // 缓存设备数量（供 refreshMessagesOnly 使用）
                    setVersionedCache(V2_CACHE_KEYS.devices, devices.length, (_a = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.banners_home) !== null && _a !== void 0 ? _a : '0_0');
                    // 缓存消息卡片（短 TTL 兜底，切 Tab 回来 refreshMessagesOnly 即时刷新）
                    setVersionedCache(V2_CACHE_KEYS.messages, messageCards, (_b = currentVersions === null || currentVersions === void 0 ? void 0 : currentVersions.banners_home) !== null && _b !== void 0 ? _b : '0_0');
                    // 迁移：清理旧版缓存键（平滑过渡到新版分段缓存）
                    try {
                        wx.removeStorageSync(LEGACY_HOME_CACHE_KEY);
                    }
                    catch { /* ignore */ }
                }
                catch {
                    // 消息加载失败静默处理，不影响首屏
                }
            })();
        }
        catch (error) {
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
        const self = this;
        const role = this.data.role;
        const loggedIn = Boolean(getToken());
        // 从版本缓存读取设备数量
        const deviceEntry = getVersionedCacheAny(V2_CACHE_KEYS.devices);
        const deviceCount = typeof (deviceEntry === null || deviceEntry === void 0 ? void 0 : deviceEntry.data) === 'number' ? deviceEntry.data : 0;
        try {
            const [alarms, familyNoticePage, systemNoticePage] = await Promise.all([
                loggedIn ? getDeviceAlarms(role).catch(() => []) : Promise.resolve([]),
                loggedIn ? getFamilyNoticePage(0, 20).catch(() => emptyPage()) : Promise.resolve(emptyPage()),
                getSystemNoticePage(0, 20).catch(() => emptyPage()),
            ]);
            if (self._pageDead)
                return;
            const helpNotices = familyNoticePage.items.filter(isEmergencyHelpNotice);
            const messageCards = [
                buildAlarmCard(alarms, deviceCount, role),
                buildHelpCard(helpNotices, loggedIn),
                buildNoticeCard(systemNoticePage.items),
            ];
            safeSetData(self, { messageCards, error: '' });
        }
        catch {
            // 消息区域刷新失败静默处理，保留旧数据不遮挡用户
        }
    },
    onRetry() {
        void this.loadHomeDashboard(true);
    },
    onOpenBanner(e) {
        var _a, _b, _c, _d;
        const routeMode = String(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.routeMode) || '').trim().toUpperCase();
        const routeUrl = String(((_d = (_c = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.routeUrl) || '').trim();
        openBannerRoute(routeMode || 'NONE', routeUrl);
    },
    onBannerChange(e) {
        var _a;
        const current = Number(((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.current) || 0);
        this.setData({ activeBannerIndex: current >= 0 ? current : 0 });
    },
    onSelectBanner(e) {
        var _a, _b;
        const index = Number(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.index) || 0);
        this.setData({ activeBannerIndex: index >= 0 ? index : 0 });
    },
    /** Banner 图片加载失败时替换为本地默认图 */
    onBannerImageError(e) {
        const index = Number(e.currentTarget.dataset.index);
        if (!Number.isFinite(index))
            return;
        const banners = this.data.bannerCards.map((b, i) => {
            if (i === index && b.imageSrc && !b.imageSrc.startsWith('/assets/')) {
                return { ...b, imageSrc: '/assets/home/home_banner_brand.jpg' };
            }
            return b;
        });
        this.setData({ bannerCards: banners });
    },
    /** 金刚区图标加载失败时隐藏该图标（保留文字区域） */
    onKingKongImageError(e) {
        const id = String(e.currentTarget.dataset.id || '');
        if (!id)
            return;
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
    onOpenMessageCard(e) {
        var _a, _b;
        const action = String(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.action) || '').trim();
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
    onOpenFeature(e) {
        var _a, _b, _c, _d;
        const targetKind = String(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.targetKind) || '').trim();
        const targetValue = String(((_d = (_c = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.targetValue) || '').trim();
        openHomeTarget(targetKind || 'service-page', targetValue);
    },
    /** 金刚区卡片点击（使用 routeMode + routeUrl，与 Banner 跳转逻辑一致） */
    onOpenKingKongRoute(e) {
        var _a, _b, _c, _d;
        const routeMode = String(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.routeMode) || '').trim();
        const routeUrl = String(((_d = (_c = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.routeUrl) || '').trim();
        openBannerRoute(routeMode, routeUrl);
    },
    onBookBenefit(e) {
        var _a, _b;
        const serviceId = normalizeText((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.serviceId);
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
                if (!modalRes.confirm)
                    return;
                wx.showLoading({ title: '正在建单...', mask: true });
                try {
                    const ticket = await initiateEmergencyHelp();
                    wx.hideLoading();
                    if (ticket) {
                        // 展示专业工单结果页
                        this.setData({ showSosResult: true, sosTicket: ticket });
                    }
                    else {
                        // 离线/开发模式：简化提示
                        wx.showToast({ title: '求助已发出，请保持电话畅通', icon: 'success', duration: 2500 });
                    }
                    void this.loadHomeDashboard();
                }
                catch (error) {
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
        const isAppLaunch = (signal === null || signal === void 0 ? void 0 : signal.source) === 'launch';
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
        if (isAssessmentCompleted())
            return;
        if (isSessionClosed())
            return;
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
        }
        else {
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
