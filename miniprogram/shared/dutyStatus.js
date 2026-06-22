function normalizedText(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isHelpRecord(deviceId, title) {
    if (deviceId === 'GLOBAL') {
        return true;
    }
    return /求助|sos/i.test(title);
}
export function getDutyAlarmMeta(input) {
    const explicitRecordTypeText = normalizedText(input.recordTypeLabel);
    const explicitRecordTypeClass = input.recordTypeClass || undefined;
    const explicitHandlingText = normalizedText(input.handledLabel);
    const explicitHandlingClass = input.handledClass || undefined;
    if (explicitRecordTypeText && explicitRecordTypeClass && explicitHandlingText && explicitHandlingClass) {
        return {
            recordTypeText: explicitRecordTypeText,
            recordTypeClass: explicitRecordTypeClass,
            handlingText: explicitHandlingText,
            handlingClass: explicitHandlingClass,
        };
    }
    const deviceId = normalizedText(input.deviceId);
    const title = normalizedText(input.title);
    const level = normalizedText(input.level).toUpperCase();
    const handled = typeof input.handled === 'boolean' ? input.handled : Boolean(input.read);
    const handlingText = handled ? '已处理' : '待处理';
    const handlingClass = handled ? 'handled' : 'pending';
    if (isHelpRecord(deviceId, title)) {
        return {
            recordTypeText: '求助记录',
            recordTypeClass: 'critical',
            handlingText,
            handlingClass,
        };
    }
    if (level === 'CRITICAL' || level === 'ABNORMAL') {
        return {
            recordTypeText: '设备异常',
            recordTypeClass: 'critical',
            handlingText,
            handlingClass,
        };
    }
    return {
        recordTypeText: '告警提示',
        recordTypeClass: level === 'INFO' ? 'info' : 'warn',
        handlingText,
        handlingClass,
    };
}
export function getServiceBookingStatusMeta(rawStatus) {
    const normalized = normalizedText(rawStatus).toUpperCase();
    switch (normalized) {
        case 'COMPLETED':
            return { status: 'COMPLETED', statusText: '已完成', statusClass: 'completed', canCancel: false };
        case 'CANCELLED':
            return { status: 'CANCELLED', statusText: '已取消', statusClass: 'cancelled', canCancel: false };
        default:
            return { status: 'PENDING', statusText: '待服务', statusClass: 'pending', canCancel: true };
    }
}
