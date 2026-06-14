import {
  fetchServiceCatalogPage,
  filterCatalogItems,
  groupCatalogByModule,
  mergeCatalogItems,
  rememberServiceItems,
  resolveServiceCatalogItemCoverSources,
  type ServiceCatalogItem,
  type ServiceCatalogSection,
} from './catalog';
import { getHomeBanners, type HomeBannerCard } from '../../services/homeBanners';
import { getCurrentServiceBooking, type ServiceBooking } from '../../services/serviceBooking';
import { getToken } from '../../utils/auth';
import { getVersionedCacheAny, setVersionedCache } from '../../utils/cache';
import { fetchConfigVersions, getCachedVersions, needsRefresh, type ConfigVersions } from '../../services/configVersions';
import { markPageDead, markPageAlive, safeSetData, guardNextTick } from '../../utils/pageGuard';
import { roleStore } from '../../store/roleStore';
import type { UserRole } from '../../shared/roles';

const SERVICE_MARKET_REGION_STORAGE_KEY = 'ab_service_market_region_v1';

/** 版本感知缓存键 —— 服务市场页分段缓存 */
const V2_MARKET_CACHE_KEYS = {
  banners: 'ab_v2_market_banners',
  catalog: 'ab_v2_market_catalog',
} as const;
const REGION_PLACEHOLDER_TEXT = '请选择省/市/区';
const AGED_REGION_PLACEHOLDER_TEXT = '选择区域';
const STANDARD_LOCATION_LOADING_TEXT = '当前定位中...';
const AGED_LOCATION_LOADING_TEXT = '定位中...';
const STANDARD_SEARCH_PLACEHOLDER_TEXT = '搜索服务名称、分类、标签';
const AGED_SEARCH_PLACEHOLDER_TEXT = '搜索服务';
const DEFAULT_SERVICE_MARKET_BANNERS: HomeBannerCard[] = [
  {
    id: 'service-market-default',
    tag: '专业评估',
    title: '预约上门专业评估',
    subtitle: '适老化改造 · 贴心服务',
    note: '留下联系方式与到访时间，安伴评估师会尽快与您确认。',
    toneClass: 'science',
    imageSrc: '/assets/banner/service_market_banner_assessment.png',
    routeMode: 'NAVIGATE',
    routeUrl:
      '/pages/appointment/index?title=%E9%A2%84%E7%BA%A6%E4%B8%8A%E9%97%A8%E4%B8%93%E4%B8%9A%E8%AF%84%E4%BC%B0&subtitle=%E7%95%99%E4%B8%8B%E8%81%94%E7%B3%BB%E6%96%B9%E5%BC%8F%E4%B8%8E%E5%88%B0%E8%AE%BF%E6%97%B6%E9%97%B4%EF%BC%8C%E5%AE%89%E4%BC%B4%E8%AF%84%E4%BC%B0%E5%B8%88%E4%BC%9A%E5%B0%BD%E5%BF%AB%E4%B8%8E%E6%82%A8%E7%A1%AE%E8%AE%A4%E3%80%82',
  },
];

type RegionState = {
  locationRegionValue: string[];
  locationRegionText: string;
  locationRegionAgedText: string;
};

type RegionPickerEvent = {
  detail?: {
    value?: unknown;
  };
};

function normalizeRegionValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
}

function extractCompactRegionText(regionText: string): string {
  const normalizedText = String(regionText || '').trim();
  if (!normalizedText) return AGED_REGION_PLACEHOLDER_TEXT;

  const slashParts = normalizedText.split('/').map((item) => String(item || '').trim()).filter(Boolean);
  if (slashParts.length) {
    return slashParts[slashParts.length - 1];
  }

  const regionMatches = normalizedText.match(/[^省\/\s]+?(?:特别行政区|自治区|自治州|地区|盟|市|区|县|旗)/g);
  if (regionMatches?.length) {
    return regionMatches[regionMatches.length - 1];
  }

  return normalizedText;
}

function resolveAgedRegionText(regionText = '', regionValue: string[] = []): string {
  const normalizedValue = normalizeRegionValue(regionValue);
  if (normalizedValue.length) {
    return normalizedValue[normalizedValue.length - 1];
  }

  const normalizedText = String(regionText || '').trim();
  if (!normalizedText || normalizedText === REGION_PLACEHOLDER_TEXT) {
    return AGED_REGION_PLACEHOLDER_TEXT;
  }
  if (normalizedText === '当前定位' || normalizedText === STANDARD_LOCATION_LOADING_TEXT) {
    return AGED_LOCATION_LOADING_TEXT;
  }
  return extractCompactRegionText(normalizedText);
}

function buildRegionState(regionText = '', regionValue: string[] = []): RegionState {
  const normalizedValue = normalizeRegionValue(regionValue);
  if (normalizedValue.length >= 3) {
    return {
      locationRegionValue: normalizedValue,
      locationRegionText: normalizedValue.join('/'),
      locationRegionAgedText: normalizedValue[normalizedValue.length - 1],
    };
  }
  const normalizedText = String(regionText || '').trim();
  return {
    locationRegionValue: normalizedValue,
    locationRegionText: normalizedText || REGION_PLACEHOLDER_TEXT,
    locationRegionAgedText: resolveAgedRegionText(normalizedText || REGION_PLACEHOLDER_TEXT, normalizedValue),
  };
}

function readMarketBannerCache(): HomeBannerCard[] | null {
  const entry = getVersionedCacheAny<HomeBannerCard[]>(V2_MARKET_CACHE_KEYS.banners);
  return entry?.data ?? null;
}

function readMarketCatalogCache(): { items: ServiceCatalogItem[]; page: number; total: number } | null {
  const entry = getVersionedCacheAny<{ items: ServiceCatalogItem[]; page: number; total: number }>(V2_MARKET_CACHE_KEYS.catalog);
  return entry?.data ?? null;
}

/**
 * 读取版本缓存条目的写入时间戳（毫秒），用于判断缓存是否过期。
 * 返回 null 表示缓存不存在或无法解析。
 */
function readCatalogCacheTimestamp(): number | null {
  try {
    const raw = wx.getStorageSync(V2_MARKET_CACHE_KEYS.catalog);
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as { t?: number };
    return typeof entry.t === 'number' ? entry.t : null;
  } catch {
    return null;
  }
}

/** 签名 URL 有效期 24h，缓存超过 12h 就强制刷新确保签名不失效 */
const CATALOG_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readStoredRegionState(): RegionState | null {
  try {
    const cached = wx.getStorageSync(SERVICE_MARKET_REGION_STORAGE_KEY);
    const value = normalizeRegionValue((cached as any)?.locationRegionValue);
    const text = String((cached as any)?.locationRegionText || '').trim();
    if (!value.length && !text) {
      return null;
    }
    return buildRegionState(text, value);
  } catch {
    return null;
  }
}

function writeStoredRegionState(state: RegionState) {
  try {
    wx.setStorageSync(SERVICE_MARKET_REGION_STORAGE_KEY, state);
  } catch {
    // ignore storage failure
  }
}

function sortSectionsForDisplay(sections: ServiceCatalogSection[]): ServiceCatalogSection[] {
  return sections
    .map((section, index) => ({ section, index, hasCover: section.items.some((item) => !!item.coverImg) }))
    .sort((left, right) => {
      if (left.hasCover !== right.hasCover) {
        return left.hasCover ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ section }) => section);
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

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: '',
    keyword: '',
    locationLoading: false,
    locationRegionValue: [] as string[],
    locationRegionText: STANDARD_LOCATION_LOADING_TEXT,
    locationRegionAgedText: AGED_LOCATION_LOADING_TEXT,
    locationRegionPlaceholderText: REGION_PLACEHOLDER_TEXT,
    locationRegionAgedPlaceholderText: AGED_REGION_PLACEHOLDER_TEXT,
    standardLocationLoadingText: STANDARD_LOCATION_LOADING_TEXT,
    agedLocationLoadingText: AGED_LOCATION_LOADING_TEXT,
    standardSearchPlaceholderText: STANDARD_SEARCH_PLACEHOLDER_TEXT,
    agedSearchPlaceholderText: AGED_SEARCH_PLACEHOLDER_TEXT,
    activeBannerIndex: 0,
    bannerCards: DEFAULT_SERVICE_MARKET_BANNERS,
    activeModule: '全部',
    modules: ['全部'] as string[],
    items: [] as ServiceCatalogItem[],
    sections: [] as ServiceCatalogSection[],
    page: 1,
    size: 10,
    total: 0,
    hasMore: true,
    filteredCount: 0,
    isFiltering: false,
    currentServiceBooking: null as ServiceBooking | null,
  },

  /** 标记是否已首次加载完成（用于 onShow 跳过重复全量请求） */
  _marketLoaded: false as boolean,
  /** 上次刷新服务预约的时间戳，避免频繁请求 */
  _lastBookingRefresh: 0 as number,
  /** 上次版本检查的时间戳，避免每次切 Tab 都发版本请求 */
  _lastVersionCheck: 0 as number,
  /** 是否正在加载中，防止并发请求 */
  _loading: false as boolean,
  /** 是否正在加载服务预约，防止重复并发请求 */
  _bookingLoading: false as boolean,
  /** 页面是否已隐藏 */
  _pageHidden: false as boolean,
  /** onLoad 是否已发起数据加载，防止 onShow 重复触发 */
  _loadStarted: false as boolean,
  /** 角色变化时是否需要在 onShow 重刷（页面隐藏期间角色变更标记） */
  _pendingRoleReload: false as boolean,
  /** roleStore 取消订阅函数 */
  __unsubRole: null as (() => void) | null,

  onLoad() {
    this._loadStarted = true;
    const storedRegion = readStoredRegionState();
    if (storedRegion) {
      this.setData(storedRegion);
    } else {
      this.setData(buildRegionState(REGION_PLACEHOLDER_TEXT));
    }

    // ===== 订阅角色变化：登录/登出时自动刷新服务市场 =====
    this.__unsubRole = roleStore.subscribe((role: UserRole) => {
      if (this._pageHidden) {
        // 页面隐藏期间角色变化，记录标记等 onShow 时刷新
        this._pendingRoleReload = true;
        return;
      }
      void this.refreshConfigData(true);
      void this.reloadCurrentServiceBooking();
    });

    // ===== 秒开渲染：先从版本缓存同步读取已有数据，立即上屏 =====
    // 注意：签名 URL 有效期 24h，缓存超过 12h 则跳过（避免展示过期 URL）
    const cachedBanners = readMarketBannerCache();
    const cachedCatalog = readMarketCatalogCache();
    const catalogCacheTimestamp = readCatalogCacheTimestamp();
    const catalogCacheAge = catalogCacheTimestamp ? Date.now() - catalogCacheTimestamp : Infinity;
    const catalogCacheValid = catalogCacheAge <= CATALOG_CACHE_MAX_AGE_MS;
    if (cachedCatalog && catalogCacheValid) {
      this.applyCatalog(cachedCatalog.items, cachedCatalog.page, cachedCatalog.total);
    }
    if (cachedBanners?.length) {
      this.setData({ bannerCards: cachedBanners });
    }
    // 缓存有效时立即结束骨架屏，无有效缓存时等网络数据返回再结束
    if (cachedCatalog && catalogCacheValid) {
      this.setData({ loading: false });
    }

    // ===== 后台版本比对 + 按需刷新（只在这里发起，onShow 不再重复）=====
    void this.refreshConfigData();
    void this.reloadCurrentServiceBooking();
  },

  onShow() {
    // 恢复页面可见标记
    markPageAlive(this as any);

    const tab = (this as any).getTabBar?.();
    if (tab?.setSelectedByRoute) tab.setSelectedByRoute();

    // 页面隐藏期间角色已变化（登录/登出）→ 立即全量刷新
    if (this._pendingRoleReload) {
      this._pendingRoleReload = false;
      this._lastBookingRefresh = 0;
      this._lastVersionCheck = 0;
      void this.refreshConfigData(true);
      void this.reloadCurrentServiceBooking();
      return;
    }

    // 已加载过 → 版本比对按需刷新（不重复全量拉取）
    if (this._marketLoaded) {
      const now = Date.now();
      // 节流：至少间隔 10 秒才再次请求预约状态（缩短以更快响应用户操作）
      if (now - (this._lastBookingRefresh || 0) >= 10 * 1000) {
        this._lastBookingRefresh = now;
        void this.reloadCurrentServiceBooking();
      }
      // 节流：至少间隔 60 秒才再次请求版本号
      if (now - (this._lastVersionCheck || 0) >= 60 * 1000) {
        this._lastVersionCheck = now;
        void this.refreshConfigData();
      }
      return;
    }
    // 首次 onShow：onLoad 已发起数据加载（_loadStarted=true），
    // 这里不再重复发起请求，避免并发两次网络请求造成卡顿。
  },

  onHide() {
    // 标记页面隐藏，阻断后续所有异步回调的 setData
    markPageDead(this as any);
  },

  onUnload() {
    // 标记页面死亡，并重置状态标志
    markPageDead(this as any);
    if (typeof this.__unsubRole === 'function') {
      this.__unsubRole();
      this.__unsubRole = null;
    }
    this._loadStarted = false;
    this._marketLoaded = false;
    this._pendingRoleReload = false;
    this._lastBookingRefresh = 0;
    this._lastVersionCheck = 0;
    this._loading = false;
    this._bookingLoading = false;
  },

  onPullDownRefresh() {
    void Promise.all([
      this.refreshConfigData(true),
      this.reloadCurrentServiceBooking(),
    ]).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return;
    void this.loadCatalog(false);
  },

  /**
   * 版本比对 + 按需刷新配置数据（Banner + 服务目录）。
   * @param forceRefresh 是否强制刷新（下拉刷新时传 true）
   */
  async refreshConfigData(forceRefresh = false) {
    if (this._loading) return;
    this._loading = true;
    try {
      // 拉取后端配置版本号
      let versions: ConfigVersions | null = null;
      try {
        versions = await fetchConfigVersions();
      } catch {
        versions = getCachedVersions(); // 版本接口失败用缓存版本兜底
      }

      // 并行按需刷新 Banner 和 目录
      const tasks: Promise<void>[] = [];

      // Banner
      const bannerCached = getVersionedCacheAny<HomeBannerCard[]>(V2_MARKET_CACHE_KEYS.banners);
      const needBanner = forceRefresh || !versions
        || needsRefresh(bannerCached?.version, versions.banners_service);
      if (needBanner) {
        tasks.push(this.doLoadBannerCards(versions?.banners_service));
      }

      // 服务目录（额外检查缓存时间戳：签名 URL 24h 后失效，超过 12h 强制刷新）
      const catalogCached = getVersionedCacheAny<{ items: ServiceCatalogItem[]; page: number; total: number }>(V2_MARKET_CACHE_KEYS.catalog);
      const catalogCacheTimestamp = readCatalogCacheTimestamp();
      const catalogCacheAge = catalogCacheTimestamp ? Date.now() - catalogCacheTimestamp : Infinity;
      const catalogCacheStale = catalogCacheAge > CATALOG_CACHE_MAX_AGE_MS;
      const needCatalog = forceRefresh || !versions
        || needsRefresh(catalogCached?.version, versions.service_catalog)
        || (!!catalogCached && catalogCacheStale);
      if (needCatalog) {
        if (catalogCacheStale && !forceRefresh) {
          console.log('[service-market] 缓存已超过 12h（签名 URL 可能失效），强制刷新目录');
        }
        tasks.push(this.doLoadCatalogWithVersion(true, versions?.service_catalog));
      }

      await Promise.all(tasks);
    } catch {
      // 版本比对失败静默处理，保留已有数据
    } finally {
      this._loading = false;
    }
  },

  async loadCatalog(reset: boolean) {
    return this.doLoadCatalogWithVersion(reset);
  },

  async doLoadCatalogWithVersion(reset: boolean, versionOverride?: string) {
    const nextPage = reset ? 1 : this.data.page + 1;
    // 重置时清除上一次可能残留的 error，避免 wx:elif="{{error}}" 阻挡成功加载的列表渲染
    if (reset) {
      this.setData({ error: '' });
    } else {
      this.setData({ loadingMore: true, error: '' });
    }
    try {
      const result = await fetchServiceCatalogPage(nextPage, this.data.size);
      const resolvedList = await resolveServiceCatalogItemCoverSources(result.list);
      const items = reset ? resolvedList : mergeCatalogItems(this.data.items, resolvedList);
      // 列表上限保护：最多保留 200 条，超出部分截断以控制 setData 体积和内存占用
      const trimmedItems = items.length > 200 ? items.slice(0, 200) : items;
      rememberServiceItems(resolvedList);

      // 写入版本感知缓存（仅首屏数据，延后到下一帧避免阻塞渲染）
      if (reset) {
        let ver = versionOverride;
        if (!ver) {
          const cached = getVersionedCacheAny<{ items: ServiceCatalogItem[]; page: number; total: number }>(V2_MARKET_CACHE_KEYS.catalog);
          ver = cached?.version ?? '0_0';
        }
        const cacheData = { items: trimmedItems, page: nextPage, total: result.total };
        guardNextTick(this as any, () => {
          setVersionedCache(V2_MARKET_CACHE_KEYS.catalog, cacheData, ver);
        });
      }

      this.applyCatalog(trimmedItems, nextPage, result.total);
    } catch (error: any) {
      if (!this._pageHidden) {
        const msg = typeof error?.message === 'string' ? error.message : '加载服务失败';
        const code = error?.code !== undefined ? `error_code ${error.code}` : '';
        this.setData({ error: code ? `${msg} (${code})` : msg });
      }
    } finally {
      if (!this._pageHidden) {
        this.setData({ loading: false, loadingMore: false });
      }
    }
  },

  async loadBannerCards() {
    return this.doLoadBannerCards();
  },

  async doLoadBannerCards(versionOverride?: string) {
    try {
      const bannerCards = await getHomeBanners('SERVICE_MARKET').catch(() => DEFAULT_SERVICE_MARKET_BANNERS);
      if (this._pageHidden) return;
      const safeBannerCards = bannerCards.length ? bannerCards : DEFAULT_SERVICE_MARKET_BANNERS;
      const currentBannerIndex = Number(this.data.activeBannerIndex || 0);
      this.setData({
        bannerCards: safeBannerCards,
        activeBannerIndex: currentBannerIndex >= 0 && currentBannerIndex < safeBannerCards.length ? currentBannerIndex : 0,
      });

      // 延后写缓存，避免网络回调中同步 IO 阻塞渲染线程
      guardNextTick(this as any, () => {
        setVersionedCache(V2_MARKET_CACHE_KEYS.banners, safeBannerCards, versionOverride ?? '0_0');
      });
    } catch {
      this.setData({
        bannerCards: DEFAULT_SERVICE_MARKET_BANNERS,
        activeBannerIndex: 0,
      });
    }
  },

  applyCatalog(items: ServiceCatalogItem[], page: number, total: number) {
    // 一次分组排序，复用于全量模块列表和过滤后的 section 列表
    const allSections = sortSectionsForDisplay(groupCatalogByModule(items));
    const modules = ['全部', ...allSections.map((section) => section.moduleTitle)];

    const normalizedKeyword = this.data.keyword.trim();
    const needFilter = !!normalizedKeyword || this.data.activeModule !== '全部';

    let sections: ServiceCatalogSection[];
    let filteredCount: number;

    if (needFilter) {
      const filteredItems = filterCatalogItems(items, normalizedKeyword, this.data.activeModule);
      sections = sortSectionsForDisplay(groupCatalogByModule(filteredItems));
      filteredCount = filteredItems.length;
    } else {
      // 无过滤时直接复用 allSections，避免额外的 group + sort 计算
      sections = allSections;
      filteredCount = items.length;
    }

    this.setData({
      items,
      page,
      total,
      modules,
      sections,
      hasMore: items.length < total,
      filteredCount,
      isFiltering: needFilter,
    });
    // 标记首次全量加载完成
    if (page === 1) {
      this._marketLoaded = true;
    }
  },

  onSearchSubmit() {
    this.applyCatalog(this.data.items, this.data.page, this.data.total);
  },

  onOpenBanner(e: WechatMiniprogram.BaseEvent) {
    const routeMode = String(e.currentTarget.dataset.routeMode || '').trim().toUpperCase() as 'NONE' | 'NAVIGATE' | 'SWITCH_TAB';
    const routeUrl = String(e.currentTarget.dataset.routeUrl || '').trim();
    openBannerRoute(routeMode || 'NONE', routeUrl);
  },

  /** Banner 图片加载失败时用默认 banner 替换 */
  onBannerImageError(e: WechatMiniprogram.CustomEvent) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(index)) return;
    const banners = this.data.bannerCards.map((b, i) => {
      if (i === index && b.imageSrc && !b.imageSrc.startsWith('/assets/')) {
        return { ...b, imageSrc: DEFAULT_SERVICE_MARKET_BANNERS[0]?.imageSrc || '/assets/banner/service_market_banner_assessment.png' };
      }
      return b;
    });
    this.setData({ bannerCards: banners });
  },

  onBannerChange(e: WechatMiniprogram.CustomEvent) {
    const current = Number(e.detail?.current || 0);
    this.setData({ activeBannerIndex: current >= 0 ? current : 0 });
  },

  onSelectBanner(e: WechatMiniprogram.BaseEvent) {
    const index = Number(e.currentTarget.dataset.index || 0);
    this.setData({ activeBannerIndex: index >= 0 ? index : 0 });
  },



  onKeywordInput(e: WechatMiniprogram.Input) {
    const keyword = typeof e.detail.value === 'string' ? e.detail.value : '';
    this.setData({ keyword });
    this.applyCatalog(this.data.items, this.data.page, this.data.total);
  },

  onPickRegion(e: RegionPickerEvent) {
    const next = buildRegionState('', normalizeRegionValue(e?.detail?.value));
    this.setData(next);
    // 延后写 Storage，避免阻塞 UI 渲染
    guardNextTick(this as any, () => writeStoredRegionState(next));
  },


  onClearKeyword() {
    if (!this.data.keyword) {
      return;
    }
    this.setData({ keyword: '' });
    this.applyCatalog(this.data.items, this.data.page, this.data.total);
  },

  onPickModule(e: WechatMiniprogram.BaseEvent) {
    const moduleTitle = String(e.currentTarget.dataset.module || '全部');
    this.setData({ activeModule: moduleTitle });
    this.applyCatalog(this.data.items, this.data.page, this.data.total);
  },

  onOpenDetail(e: WechatMiniprogram.BaseEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const current = this.data.items.find((item) => item.id === id) || null;
    wx.navigateTo({
      url: `/pages/service-detail/index?id=${encodeURIComponent(id)}`,
      success: (result) => {
        if (current) {
          result.eventChannel.emit('service-item', current);
        }
      },
    });
  },

  /** 服务封面图加载失败时将该项标记为 _coverFailed，自动切换为文字占位 */
  onCoverImageError(e: WechatMiniprogram.CustomEvent) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) return;
    const failedItem = this.data.items.find((i) => i.id === id);
    console.error('[service-market] 封面图加载失败 — id:', id, 'coverSrc:', JSON.stringify(failedItem?.coverSrc), 'coverImg:', JSON.stringify(failedItem?.coverImg));
    if (failedItem?.coverSrc) {
      const src = failedItem.coverSrc;
      if (src.startsWith('https://') && !src.includes('Expires=') && !src.includes('Signature=')) {
        console.error('[service-market] ⚠️ 失败的 URL 不含签名参数，很可能是后端未生成签名 URL！请检查：1) 后端 OSS 凭证是否配置 2) service_catalog 缓存是否需清除');
      }
      if (src.length > 200) {
        console.log('[service-market] 失败 URL 前200字:', src.substring(0, 200));
      }
    }
    const items = this.data.items.map((item) => {
      if (item.id === id) {
        return { ...item, _coverFailed: true };
      }
      return item;
    });
    // 重新计算 sections（带新的 _coverFailed 标记）
    const allSections = sortSectionsForDisplay(groupCatalogByModule(items));
    const modules = ['全部', ...allSections.map((s) => s.moduleTitle)];
    const needFilter = !!this.data.keyword.trim() || this.data.activeModule !== '全部';
    let sections: ServiceCatalogSection[];
    let filteredCount: number;
    if (needFilter) {
      const filtered = filterCatalogItems(items, this.data.keyword.trim(), this.data.activeModule);
      sections = sortSectionsForDisplay(groupCatalogByModule(filtered));
      filteredCount = filtered.length;
    } else {
      sections = allSections;
      filteredCount = items.length;
    }
    this.setData({ items, modules, sections, filteredCount, isFiltering: needFilter });
  },

  onResetFilters() {
    this.setData({ keyword: '', activeModule: '全部' });
    this.applyCatalog(this.data.items, this.data.page, this.data.total);
  },

  async reloadCurrentServiceBooking() {
    // 页面隐藏时跳过
    if (this._pageHidden) return;
    // 防止并发重复请求
    if (this._bookingLoading) return;
    if (!getToken()) {
      this.setData({ currentServiceBooking: null });
      return;
    }
    this._bookingLoading = true;
    try {
      const currentServiceBooking = await getCurrentServiceBooking();
      if (this._pageHidden) return;
      this.setData({ currentServiceBooking });
    } catch {
      if (!this._pageHidden) {
        this.setData({ currentServiceBooking: null });
      }
    } finally {
      this._bookingLoading = false;
    }
  },

  onOpenServiceBookings() {
    wx.navigateTo({ url: '/pages/service-bookings/index' });
  },

  onCallCurrentServiceManager() {
    const phone = this.data.currentServiceBooking?.serviceContact.phone || '18526209432';
    wx.makePhoneCall({ phoneNumber: phone });
  },
});