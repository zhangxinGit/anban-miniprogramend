import { request } from '../utils/request';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter(isRecord);
}
export async function getHomeBenefits() {
    const result = await request({
        url: '/api/app/home/benefits',
        method: 'GET',
        skipBreaker: true,
    });
    if (!result.ok) {
        console.error('[Benefit API] 请求失败:', result.message);
        throw new Error(result.message || '加载福利专区失败');
    }
    const rawList = readList(result.data);
    const mapped = rawList.map((item) => ({
        id: readString(item.id),
        kicker: readString(item.kicker),
        title: readString(item.title),
        desc: readString(item.desc),
        serviceId: readString(item.serviceId),
        accentClass: readString(item.accentClass),
    }));
    return mapped.filter((item) => !!item.id && !!item.title);
}
