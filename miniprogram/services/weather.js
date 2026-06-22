import { request } from '../utils/request';
import { getPreferredFamilyId } from './familyProfile';
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function readString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function readNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}
function readBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
            return true;
        }
        if (normalized === '0' || normalized === 'false' || normalized === 'no') {
            return false;
        }
    }
    return fallback;
}
function normalizeFamilyId(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return /^\d+$/.test(text) ? text : '';
}
export async function getCurrentWeather() {
    const familyId = normalizeFamilyId(getPreferredFamilyId());
    const result = await request({
        url: familyId ? `/api/app/weather/current?familyId=${encodeURIComponent(familyId)}` : '/api/app/weather/current',
        method: 'GET',
    });
    if (!result.ok) {
        throw new Error(result.message || '加载天气失败');
    }
    const payload = isRecord(result.data) ? result.data : {};
    const temperatureCelsius = readNumber(payload.temperature_celsius);
    const temperatureText = readString(payload.temperature_text) || `${Math.round(temperatureCelsius)}°`;
    return {
        locationLabel: readString(payload.location_label),
        temperatureText,
        temperatureCelsius,
        weatherText: readString(payload.weather_text) || '天气',
        iconClass: readString(payload.icon_class) || 'sunny',
        isDay: readBoolean(payload.is_day, true),
        observedAt: readString(payload.observed_at),
        fromCache: readBoolean(payload.from_cache),
    };
}
