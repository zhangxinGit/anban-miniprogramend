import { batteryLabel, getDeviceAlarmRecords, getDeviceById, getDeviceRadarReport, getEmergencyContacts, addEmergencyContact, removeEmergencyContact, } from '../../services/deviceCenter';
function fmtTime(ts) {
    const d = new Date(ts);
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}
function fmtOnline(online) {
    return online === 'ONLINE' ? '在线' : '离线';
}
function resolveInstallLocation(installLocation) {
    const value = String(installLocation || '').trim();
    return value || '未设置';
}
function shortDeviceNo(sn) {
    const normalized = String(sn || '').trim();
    return normalized ? normalized.slice(-4) : '--';
}
function toneClass(tone) {
    switch (String(tone || '').trim().toLowerCase()) {
        case 'positive':
            return 'positive';
        case 'warn':
            return 'warn';
        case 'danger':
            return 'danger';
        default:
            return 'neutral';
    }
}
function calcBarWidth(value, maxValue) {
    const current = Number(value || 0);
    const max = Number(maxValue || 0);
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0 || current <= 0) {
        return 0;
    }
    const raw = Math.round((current / max) * 100);
    return Math.max(10, Math.min(100, raw));
}
function decorateRadarReport(report) {
    if (!report)
        return null;
    const summaryCards = Array.isArray(report.summaryCards)
        ? report.summaryCards.map((card) => ({
            ...card,
            toneClass: toneClass(card.tone),
        }))
        : [];
    const trendCharts = Array.isArray(report.trendCharts)
        ? report.trendCharts.map((chart) => ({
            ...chart,
            points: Array.isArray(chart.points)
                ? chart.points.map((point) => ({
                    ...point,
                    toneClass: toneClass(point.tone),
                    barWidth: calcBarWidth(point.value, chart.maxValue),
                }))
                : [],
        }))
        : [];
    const alertStats = Array.isArray(report.alertStats)
        ? report.alertStats.map((item) => ({
            ...item,
            toneClass: toneClass(item.tone),
        }))
        : [];
    return {
        ...report,
        summaryCards,
        trendCharts,
        alertStats,
        sampleCountText: report.sampleCount ? `${report.sampleCount} 条` : '',
        emptyMessage: report.emptyMessage || '暂无雷达趋势数据',
    };
}
function maskPhone(phone) {
    if (!phone || phone.length < 7)
        return phone || '***';
    return phone.slice(0, 3) + '****' + phone.slice(-4);
}
Page({
    data: {
        loading: true,
        error: '',
        deviceId: '',
        device: null,
        alarms: [],
        report: null,
        // 紧急联系人
        emergencyContacts: [],
        emergencyLoading: false,
        emergencyError: '',
        showAddContact: false,
        newContactPhone: '',
        newContactName: '',
        addContactError: '',
        addContactSubmitting: false,
    },
    onLoad(query) {
        const deviceId = (query === null || query === void 0 ? void 0 : query.id) ? String(query.id) : '';
        this.setData({ deviceId });
        this.reload();
        // 独立加载紧急联系人，不受设备/告警/报表 API 失败影响
        this.loadEmergencyContacts();
    },
    async reload() {
        this.setData({ loading: true, error: '' });
        try {
            const id = this.data.deviceId;
            if (!id)
                throw new Error('缺少设备参数');
            const [device, alarms, report] = await Promise.all([
                getDeviceById(id),
                getDeviceAlarmRecords(id),
                getDeviceRadarReport(id),
            ]);
            // 页面已隐藏/销毁，不再 setData，避免无效渲染和内存引用
            if (this._pageHidden)
                return;
            this.setData({
                loading: false,
                device: device
                    ? {
                        ...device,
                        titleText: `${device.name} ${shortDeviceNo(device.sn)}`,
                        onlineText: fmtOnline(device.online),
                        onlineClass: device.online === 'ONLINE' ? 'on' : 'off',
                        batteryText: batteryLabel(device.battery),
                        installLocationText: resolveInstallLocation(device.installLocation),
                        lastSeenText: fmtTime(device.lastSeenAt),
                    }
                    : null,
                alarms: alarms.map((a) => ({ ...a, timeText: fmtTime(a.createdAt) })),
                report: decorateRadarReport(report),
            });
        }
        catch (e) {
            if (this._pageHidden)
                return;
            this.setData({
                loading: false,
                error: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '加载失败',
            });
        }
    },
    async loadEmergencyContacts() {
        const id = this.data.deviceId;
        if (!id)
            return;
        this.setData({ emergencyLoading: true, emergencyError: '' });
        try {
            const contacts = await getEmergencyContacts(id);
            if (this._pageHidden)
                return;
            this.setData({
                emergencyLoading: false,
                emergencyContacts: contacts.map((c) => ({
                    ...c,
                    phoneMasked: maskPhone(c.phone),
                })),
            });
        }
        catch (e) {
            if (this._pageHidden)
                return;
            const raw = typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '';
            // 将后端权限错误转换为用户可理解的提示
            const friendly = !raw || raw === 'forbidden' || raw === 'unauthorized'
                ? '紧急联系人加载失败，请确认设备已绑定到您的家庭'
                : raw;
            this.setData({
                emergencyLoading: false,
                emergencyError: friendly,
            });
        }
    },
    onRetry() {
        this.reload();
    },
    goBack() {
        wx.navigateBack();
    },
    // ---- 紧急联系人操作 ----
    /** 打开添加紧急联系人面板 */
    onOpenAddContact() {
        // 前端上限拦截，避免每次都走到后端才报错
        if (this.data.emergencyContacts.length >= 5) {
            wx.showToast({ title: '最多添加5个紧急联系人', icon: 'none' });
            return;
        }
        this.setData({
            showAddContact: true,
            newContactPhone: '',
            newContactName: '',
            addContactError: '',
            addContactSubmitting: false,
        });
    },
    /** 空操作，用于阻止事件冒泡 */
    noop() { },
    /** 关闭添加面板 */
    onCancelAddContact() {
        this.setData({
            showAddContact: false,
            newContactPhone: '',
            newContactName: '',
            addContactError: '',
        });
    },
    /** 手机号输入变化 */
    onPhoneInput(e) {
        this.setData({ newContactPhone: e.detail.value || '', addContactError: '' });
    },
    /** 姓名输入变化 */
    onNameInput(e) {
        this.setData({ newContactName: e.detail.value || '' });
    },
    /** 提交新联系人 */
    async onSubmitAddContact() {
        const phone = (this.data.newContactPhone || '').trim();
        if (!phone) {
            this.setData({ addContactError: '请输入手机号' });
            return;
        }
        if (!/^1\d{10}$/.test(phone.replace(/[^0-9]/g, ''))) {
            this.setData({ addContactError: '请输入正确的11位手机号' });
            return;
        }
        this.setData({ addContactSubmitting: true, addContactError: '' });
        try {
            const contact = await addEmergencyContact(this.data.deviceId, phone, (this.data.newContactName || '').trim() || undefined);
            this.setData({
                showAddContact: false,
                addContactSubmitting: false,
                newContactPhone: '',
                newContactName: '',
                emergencyContacts: [
                    { ...contact, phoneMasked: maskPhone(contact.phone) },
                    ...this.data.emergencyContacts,
                ],
            });
            wx.showToast({ title: '添加成功', icon: 'success' });
        }
        catch (e) {
            this.setData({
                addContactSubmitting: false,
                addContactError: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '添加失败',
            });
        }
    },
    /** 删除联系人 */
    async onRemoveContact(e) {
        var _a, _b;
        const contactId = (_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
        if (!contactId)
            return;
        wx.showModal({
            title: '确认删除',
            content: '确定要移除此紧急联系人吗？',
            confirmText: '删除',
            confirmColor: '#d74d34',
            success: async (res) => {
                if (!res.confirm)
                    return;
                try {
                    await removeEmergencyContact(this.data.deviceId, Number(contactId));
                    this.setData({
                        emergencyContacts: this.data.emergencyContacts.filter((c) => c.id !== contactId),
                    });
                    wx.showToast({ title: '已移除', icon: 'success' });
                }
                catch (e) {
                    wx.showToast({
                        title: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '操作失败',
                        icon: 'none',
                    });
                }
            },
        });
    },
    /** 页面隐藏：标记状态，阻止异步请求完成后继续 setData */
    onHide() {
        this._pageHidden = true;
    },
    /** 页面卸载：重置状态，释放引用 */
    onUnload() {
        this._pageHidden = true;
    },
});
