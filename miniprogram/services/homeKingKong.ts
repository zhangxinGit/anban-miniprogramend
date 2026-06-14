import { request } from '../utils/request';

type JsonRecord = Record<string, unknown>;
type BackendKingKongRow = JsonRecord;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readList(value: unknown): BackendKingKongRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizeRouteMode(value: unknown): 'NONE' | 'NAVIGATE' | 'SWITCH_TAB' {
  const normalized = readString(value).toUpperCase();
  if (normalized === 'NAVIGATE') return 'NAVIGATE';
  if (normalized === 'SWITCH_TAB') return 'SWITCH_TAB';
  return 'NONE';
}

export type HomeKingKongCard = {
  id: string;
  bgColor: string;
  title: string;
  subtitle: string;
  actionText: string;
  iconSrc: string;
  routeMode: 'NONE' | 'NAVIGATE' | 'SWITCH_TAB';
  routeUrl: string;
};

export async function getHomeKingKong(): Promise<HomeKingKongCard[]> {
  const result = await request<BackendKingKongRow[]>({
    url: '/api/app/home/kingkong',
    method: 'GET',
    skipBreaker: true,
  });
  if (!result.ok) {
    console.error('[KingKong API] 请求失败:', result.message);
    throw new Error(result.message || '加载首页金刚区失败');
  }

  const rawList = readList(result.data);
  console.log('[KingKong API] 原始数据条数:', rawList.length);
  rawList.forEach((item, i) => {
    const src = readString(item.iconSrc);
    console.log(`[KingKong API] 第${i}条 iconSrc 前100字符:`, src.substring(0, 100));
  });

  const mapped = rawList.map((item) => ({
    id: readString(item.id),
    bgColor: readString(item.bgColor),
    title: readString(item.titleText),
    subtitle: readString(item.subtitleText),
    actionText: readString(item.actionText),
    iconSrc: readString(item.iconSrc),
    routeMode: normalizeRouteMode(item.routeMode),
    routeUrl: readString(item.routeUrl),
  }));
  console.log('[KingKong API] mapped 后', mapped.map(i => ({ id: i.id, iconSrcLen: i.iconSrc.length, iconSrcPreview: i.iconSrc.substring(0, 60) })));
  const filtered = mapped.filter((item) => !!item.id && !!item.title);
  console.log('[KingKong API] filtered 后条数:', filtered.length);
  return filtered;
}
