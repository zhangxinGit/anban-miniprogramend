import { request } from '../utils/request';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(isRecord);
}
function normalizeRouteMode(value) {
    const normalized = readString(value).toUpperCase();
    if (normalized === 'NAVIGATE')
        return 'NAVIGATE';
    if (normalized === 'SWITCH_TAB')
        return 'SWITCH_TAB';
    return 'NONE';
}
export async function getHomeBanners(scene = 'HOME') {
    const sceneParam = scene === 'SERVICE_MARKET' ? 'SERVICE_MARKET' : 'HOME';
    const result = await request({
        url: `/api/app/home/banners?scene=${encodeURIComponent(sceneParam)}`,
        method: 'GET',
        skipBreaker: true,
    });
    if (!result.ok) {
        console.error('[Banner API] 请求失败:', result.message);
        throw new Error(result.message || '加载首页 Banner 失败');
    }
    const rawList = readList(result.data);
    console.log('[Banner API] 原始数据条数:', rawList.length);
    rawList.forEach((item, i) => {
        const src = readString(item.imageSrc);
        console.log(`[Banner API] 第${i}条 imageSrc 前100字符:`, src.substring(0, 100));
    });
    const mapped = rawList.map((item) => ({
        id: readString(item.id),
        tag: readString(item.tagText),
        title: readString(item.titleText),
        subtitle: readString(item.subtitleText),
        note: readString(item.noteText),
        toneClass: readString(item.toneClass) || 'brand',
        imageSrc: readString(item.imageSrc),
        routeMode: normalizeRouteMode(item.routeMode),
        routeUrl: readString(item.routeUrl),
    }));
    console.log('[Banner API] mapped 后', mapped.map(i => ({ id: i.id, imageSrcLen: i.imageSrc.length, imageSrcPreview: i.imageSrc.substring(0, 60) })));
    const filtered = mapped.filter((item) => !!item.id && !!item.title && !!item.imageSrc);
    console.log('[Banner API] filtered 后条数:', filtered.length);
    return filtered;
}
