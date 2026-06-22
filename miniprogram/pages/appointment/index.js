import { roleStore } from '../../store/roleStore';
import { isLoggedIn } from '../../utils/auth';
import { cancelAppointment, getAppointment, getLastContact, submitAppointment, } from '../../services/appointment';
import { showAppModal } from '../../utils/modal';
import { requireLogin } from '../../utils/loginGate';
import { getErrorMessage } from '../../utils/errorMessage';
function isPhone(s) {
    return /^1\d{10}$/.test(s);
}
function today() {
    const d = new Date();
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}
function buildRegionState(familyAddress) {
    const normalized = String(familyAddress || '').trim();
    const parts = normalized
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean);
    if (parts.length >= 3) {
        const value = parts.slice(0, 3);
        return {
            addressRegionValue: value,
            addressRegionText: value.join('/'),
        };
    }
    return {
        addressRegionValue: [],
        addressRegionText: normalized || '请选择省/市/区',
    };
}
function decodeQueryText(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    try {
        return decodeURIComponent(text);
    }
    catch {
        return text;
    }
}
function buildSceneConfig(query) {
    const serviceName = decodeQueryText(query === null || query === void 0 ? void 0 : query.serviceName);
    const serviceCategory = decodeQueryText(query === null || query === void 0 ? void 0 : query.serviceCategory);
    const sceneTitle = decodeQueryText(query === null || query === void 0 ? void 0 : query.title);
    const sceneSubtitle = decodeQueryText(query === null || query === void 0 ? void 0 : query.subtitle);
    if (sceneTitle || sceneSubtitle) {
        return {
            sceneTag: serviceName ? '安伴上门服务' : '专业评估师上门',
            sceneTitle: sceneTitle || '预约上门评估',
            sceneSubtitle: sceneSubtitle || '填写联系信息与到访时间，安伴评估师会尽快与您确认。',
            serviceName,
            serviceCategory,
        };
    }
    if (serviceName) {
        return {
            sceneTag: '安伴上门服务',
            sceneTitle: '预约上门服务',
            sceneSubtitle: '填写联系信息与到访时间，安伴顾问会尽快与您确认。',
            serviceName,
            serviceCategory,
        };
    }
    return {
        sceneTag: '专业评估师上门',
        sceneTitle: '预约上门评估',
        sceneSubtitle: '填写联系信息与到访时间，安伴评估师会尽快与您确认。',
        serviceName: '',
        serviceCategory: '',
    };
}
function formatAppointmentSlot(date, time) {
    return [date, time].filter(Boolean).join(' ');
}
Page({
    data: {
        loading: true,
        submitting: false,
        error: '',
        role: roleStore.getState().role,
        isGuestMode: !isLoggedIn(),
        appointment: null,
        addressRegionValue: [],
        addressRegionText: '请选择省/市/区',
        sceneTag: '专业评估师上门',
        sceneTitle: '预约上门评估',
        sceneSubtitle: '填写联系信息与到访时间，安伴评估师会尽快与您确认。',
        serviceName: '',
        serviceCategory: '',
        successPopupVisible: false,
        successPopupDateText: '',
        form: {
            name: '',
            phone: '',
            familyAddress: '',
            doorplate: '',
            date: '',
            time: '',
            remark: '',
        },
    },
    onLoad(query) {
        this.setData(buildSceneConfig(query));
        const page = this;
        page.__unsub = roleStore.subscribe((role) => {
            this.setData({ role });
            this.reload();
        });
        this.reload();
    },
    onUnload() {
        const page = this;
        const u = page.__unsub;
        if (typeof u === 'function')
            u();
    },
    async reload() {
        this.setData({ loading: true, error: '' });
        try {
            const role = this.data.role;
            const appt = await getAppointment(role);
            const contact = getLastContact();
            const form = {
                name: (appt === null || appt === void 0 ? void 0 : appt.name) || contact.name || '',
                phone: (appt === null || appt === void 0 ? void 0 : appt.phone) || contact.phone || '',
                familyAddress: (appt === null || appt === void 0 ? void 0 : appt.familyAddress) || contact.familyAddress || '',
                doorplate: (appt === null || appt === void 0 ? void 0 : appt.doorplate) || contact.doorplate || '',
                date: (appt === null || appt === void 0 ? void 0 : appt.date) || '',
                time: (appt === null || appt === void 0 ? void 0 : appt.time) || '',
                remark: (appt === null || appt === void 0 ? void 0 : appt.remark) || '',
            };
            const regionState = buildRegionState(form.familyAddress);
            this.setData({
                loading: false,
                appointment: appt,
                form,
                ...regionState,
                isGuestMode: !isLoggedIn(),
            });
        }
        catch (error) {
            this.setData({ loading: false, error: getErrorMessage(error, '加载失败') });
        }
    },
    onRetry() {
        this.reload();
    },
    onInput(e) {
        var _a, _b, _c, _d;
        if (!requireLogin({
            title: '登录后填写预约',
            content: '当前页面仅供预览，登录后可填写并提交预约信息。',
        }))
            return;
        const key = (_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.key;
        const value = (_d = (_c = e === null || e === void 0 ? void 0 : e.detail) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : '';
        if (!key)
            return;
        this.setData({ form: { ...this.data.form, [key]: value } });
    },
    onPickDate(e) {
        var _a;
        if (!requireLogin({
            title: '登录后填写预约',
            content: '当前页面仅供预览，登录后可填写并提交预约信息。',
        }))
            return;
        const v = ((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) || '';
        this.setData({ form: { ...this.data.form, date: v } });
    },
    onPickTime(e) {
        var _a;
        if (!requireLogin({
            title: '登录后填写预约',
            content: '当前页面仅供预览，登录后可填写并提交预约信息。',
        }))
            return;
        const v = ((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value) || '';
        this.setData({ form: { ...this.data.form, time: v } });
    },
    onPickRegion(e) {
        var _a;
        if (!requireLogin({
            title: '登录后填写预约',
            content: '当前页面仅供预览，登录后可填写并提交预约信息。',
        }))
            return;
        const value = Array.isArray((_a = e === null || e === void 0 ? void 0 : e.detail) === null || _a === void 0 ? void 0 : _a.value)
            ? e.detail.value.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
        const familyAddress = value.join('/');
        this.setData({
            addressRegionValue: value,
            addressRegionText: familyAddress || '请选择省/市/区',
            form: {
                ...this.data.form,
                familyAddress,
            },
        });
    },
    validate(form) {
        if (!form.name.trim())
            return '请输入姓名';
        if (!isPhone(form.phone.trim()))
            return '请输入正确的手机号';
        if (!form.familyAddress.trim())
            return '请选择家庭住址';
        if (!form.doorplate.trim())
            return '请输入详细地址';
        if (!form.date)
            return '请选择日期';
        if (!form.time)
            return '请选择时间';
        if (form.date < today())
            return '预约日期不能早于今天';
        return null;
    },
    async onSubmit() {
        if (!requireLogin({
            title: '登录后提交预约',
            content: '预约服务仅支持登录后提交，当前可先预览填写项。',
        }))
            return;
        const form = {
            name: this.data.form.name.trim(),
            phone: this.data.form.phone.trim(),
            familyAddress: this.data.form.familyAddress.trim(),
            doorplate: this.data.form.doorplate.trim(),
            date: this.data.form.date,
            time: this.data.form.time,
            remark: (this.data.form.remark || '').trim(),
        };
        const err = this.validate(form);
        if (err) {
            wx.showToast({ title: err, icon: 'none' });
            return;
        }
        this.setData({ submitting: true });
        try {
            const appointment = await submitAppointment(this.data.role, {
                ...form,
                serviceName: this.data.serviceName,
                serviceCategory: this.data.serviceCategory,
                sceneTitle: this.data.sceneTitle,
            });
            this.setData({
                appointment,
                successPopupVisible: true,
                successPopupDateText: formatAppointmentSlot(appointment.date, appointment.time),
                isGuestMode: !isLoggedIn(),
            });
        }
        catch (error) {
            wx.showToast({ title: getErrorMessage(error, '提交失败'), icon: 'none' });
        }
        finally {
            this.setData({ submitting: false });
        }
    },
    onCancel() {
        if (!requireLogin({
            title: '登录后管理预约',
            content: '预约记录仅支持登录后管理。',
        }))
            return;
        const role = this.data.role;
        if (!this.data.appointment || this.data.appointment.status !== 'ACTIVE')
            return;
        showAppModal({
            title: '取消预约',
            content: '确认取消当前预约吗？',
            confirmText: '取消预约',
            tone: 'danger',
            success: async (res) => {
                if (!res.confirm)
                    return;
                this.setData({ submitting: true });
                try {
                    await cancelAppointment(role);
                    await this.reload();
                    wx.showToast({ title: '已取消', icon: 'success' });
                }
                catch (error) {
                    wx.showToast({ title: getErrorMessage(error, '取消失败'), icon: 'none' });
                }
                finally {
                    this.setData({ submitting: false });
                }
            },
        });
    },
    onCloseSuccessPopup() {
        this.setData({ successPopupVisible: false });
        void this.reload();
    },
    onContactAdvisor() {
        if (!requireLogin({
            title: '登录后联系评估师',
            content: '联系评估师仅支持登录后发起。',
        }))
            return;
        wx.makePhoneCall({ phoneNumber: '18526209432' });
    },
    noop() { },
});
