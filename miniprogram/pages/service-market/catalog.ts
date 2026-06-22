import { request, type ApiResp } from '../../utils/request';
import { resolveMiniProgramImageSrc } from '../../utils/image';

type BackendCatalogRow = {
  id?: string | number;
  moduleTitle?: string;
  serviceName?: string;
  coverImg?: string;
  coverImgDetail?: string;
  price?: string | number;
  originalPrice?: string | number;
  tagList?: string[];
};

export type ServiceCatalogItem = {
  id: string;
  moduleTitle: string;
  serviceName: string;
  coverImg: string;
  coverSrc: string;
  coverImgDetail: string;
  coverImgDetailSource: string;
  price: string;
  originalPrice: string;
  tagList: string[];
};

export type ServiceCatalogSection = {
  moduleTitle: string;
  items: ServiceCatalogItem[];
};

export type ServiceCatalogPage = {
  total: number;
  list: ServiceCatalogItem[];
};

const serviceSnapshot = new Map<string, ServiceCatalogItem>();
/** 服务快照最大缓存条目数，防止长时间使用导致内存无限增长 */
const SNAPSHOT_MAX_SIZE = 200;

function pruneSnapshot() {
  if (serviceSnapshot.size <= SNAPSHOT_MAX_SIZE) return;
  // 删除最早的条目（Map 保持插入顺序）
  const keysToDelete = Array.from(serviceSnapshot.keys()).slice(0, serviceSnapshot.size - SNAPSHOT_MAX_SIZE);
  keysToDelete.forEach((k) => serviceSnapshot.delete(k));
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const unique = new Set<string>();
  tags.forEach((tag) => {
    const normalized = normalizeText(tag);
    if (normalized) {
      unique.add(normalized);
    }
  });
  return Array.from(unique);
}

let _catalogRowDebugDone = false;

function normalizeRow(row: BackendCatalogRow): ServiceCatalogItem {
  const coverImg = normalizeText(row.coverImg);
  const coverImgDetail = normalizeText(row.coverImgDetail);
  if (!_catalogRowDebugDone) {
    _catalogRowDebugDone = true;
    console.log('[catalog] normalizeRow 示例 — 原始 coverImg:', JSON.stringify(row.coverImg));
    console.log('[catalog] normalizeRow 示例 — 规范化后 coverImg:', JSON.stringify(coverImg));
    if (coverImg && coverImg.startsWith('https://')) {
      const isSigned = coverImg.includes('Expires=') || coverImg.includes('Signature=') || coverImg.includes('OSSAccessKeyId=');
      console.log('[catalog] coverImg 是 HTTPS URL, 是否含签名参数:', isSigned);
      if (!isSigned) {
        console.warn('[catalog] ⚠️ coverImg 是 OSS 公开 URL（无签名参数），Bucket 为私有权限将无法访问！请检查后端 OSS 凭证配置和缓存。');
      }
    } else if (coverImg && coverImg.startsWith('data:')) {
      console.log('[catalog] coverImg 是 base64 Data URI，将通过本地文件写入解析');
    } else if (!coverImg) {
      console.warn('[catalog] ⚠️ coverImg 为空，服务将无封面图');
    }
  }
  return {
    id: normalizeText(row.id),
    moduleTitle: normalizeText(row.moduleTitle) || '默认服务',
    serviceName: normalizeText(row.serviceName) || '未命名服务',
    coverImg,
    coverSrc: coverImg,
    coverImgDetail,
    coverImgDetailSource: coverImgDetail,
    price: normalizeText(row.price) || '0.00',
    originalPrice: normalizeText(row.originalPrice) || normalizeText(row.price) || '0.00',
    tagList: normalizeTags(row.tagList),
  };
}

let _coverSourceDebugDone = false;

export async function resolveServiceCatalogItemCoverSource(item: ServiceCatalogItem): Promise<ServiceCatalogItem> {
  const coverSrc = await resolveMiniProgramImageSrc(item.coverImg);
  const coverImgDetailSource = item.coverImgDetail ? await resolveMiniProgramImageSrc(item.coverImgDetail) : item.coverSrc;
  if (!_coverSourceDebugDone) {
    _coverSourceDebugDone = true;
    console.log('[catalog] resolveCoverSource 示例 — coverImg:', JSON.stringify(item.coverImg));
    console.log('[catalog] resolveCoverSource 示例 — coverSrc:', JSON.stringify(coverSrc));
    console.log('[catalog] resolveCoverSource 示例 — coverImgDetail:', JSON.stringify(item.coverImgDetail));
    console.log('[catalog] resolveCoverSource 示例 — coverImgDetailSource:', JSON.stringify(coverImgDetailSource));
    if (coverSrc && coverSrc.startsWith('https://')) {
      console.log('[catalog] coverSrc 是 HTTPS URL, 是否含签名:', coverSrc.includes('Expires=') || coverSrc.includes('Signature='));
    }
  }
  if (coverSrc === item.coverSrc && coverImgDetailSource === item.coverImgDetailSource) {
    return item;
  }
  return { ...item, coverSrc, coverImgDetailSource };
}

export async function resolveServiceCatalogItemCoverSources(items: ServiceCatalogItem[]): Promise<ServiceCatalogItem[]> {
  return await Promise.all(items.map((item) => resolveServiceCatalogItemCoverSource(item)));
}

export function rememberServiceItems(items: ServiceCatalogItem[]) {
  items.forEach((item) => {
    serviceSnapshot.set(item.id, item);
  });
  pruneSnapshot();
}

export function readServiceItem(id: string): ServiceCatalogItem | null {
  return serviceSnapshot.get(id) || null;
}

export async function fetchServiceCatalogPage(page: number, size: number): Promise<ServiceCatalogPage> {
  const resp: ApiResp<{ total?: string | number; list?: BackendCatalogRow[] }> = await request({
    url: `/api/app/service-catalog?page=${page}&size=${size}`,
    method: 'GET',
    skipBreaker: true,
  });

  if (!resp.ok) {
    const err = new Error(resp.message || '加载服务失败') as Error & { code?: string | number };
    err.code = resp.code;
    throw err;
  }

  const total = Number(resp.data?.total || 0);
  const list = Array.isArray(resp.data?.list) ? resp.data?.list.map(normalizeRow) : [];
  return { total: Number.isFinite(total) ? total : 0, list };
}

export function mergeCatalogItems(current: ServiceCatalogItem[], incoming: ServiceCatalogItem[]): ServiceCatalogItem[] {
  const next = [...current];
  incoming.forEach((item) => {
    const index = next.findIndex((currentItem) => currentItem.id === item.id);
    if (index === -1) {
      next.push(item);
      return;
    }
    next[index] = { ...next[index], ...item };
  });
  return next;
}

export function filterCatalogItems(
  items: ServiceCatalogItem[],
  keyword: string,
  moduleTitle: string,
): ServiceCatalogItem[] {
  const normalizedKeyword = normalizeText(keyword).toLowerCase();
  return items.filter((item) => {
    const matchesModule = !moduleTitle || moduleTitle === '全部' || item.moduleTitle === moduleTitle;
    if (!matchesModule) return false;
    if (!normalizedKeyword) return true;
    const haystack = [item.moduleTitle, item.serviceName, ...item.tagList].join(' ').toLowerCase();
    return haystack.includes(normalizedKeyword);
  });
}

export function groupCatalogByModule(items: ServiceCatalogItem[]): ServiceCatalogSection[] {
  const grouped = new Map<string, ServiceCatalogItem[]>();
  items.forEach((item) => {
    const existing = grouped.get(item.moduleTitle) || [];
    existing.push(item);
    grouped.set(item.moduleTitle, existing);
  });
  return Array.from(grouped.entries()).map(([moduleTitle, rows]) => ({ moduleTitle, items: rows }));
}