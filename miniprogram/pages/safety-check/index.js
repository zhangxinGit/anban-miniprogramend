import { roleStore } from '../../store/roleStore';
import { getBoundPhone } from '../../utils/auth';
import { canAccess } from '../../utils/acl';
import { computeRiskLevel, getLeadStatus, getSafetyHistory, leadStatusLabel, submitSafetyCheck, } from '../../services/safetyCheck';
import { capturePendingReferralCode, getPendingReferralCode } from '../../services/referral';
import { pushSystemNotice } from '../../services/messageCenter';
import { fmtTime, riskMeta, SAFETY_QUESTIONS } from '../../shared/safetySurvey';
import { showAppModal } from '../../utils/modal';
import { requireLogin } from '../../utils/loginGate';
import { markAssessmentCompleted } from '../../utils/assessmentPopup';
import { getErrorMessage } from '../../utils/errorMessage';
const DEFAULT_RISK = { color: '#0E8946', icon: '✓', text: '低风险' };
const APPOINTMENT_TITLE = '预约上门专业评估';
const APPOINTMENT_SUBTITLE = '留下联系方式与到访时间，安伴评估师会尽快与您确认。';
function buildInitialProfile() {
    return {
        respondentName: '',
        respondentGender: 'male',
        respondentAge: '',
        respondentPhone: getBoundPhone() || '',
    };
}
function normalizeName(value) {
    return String(value || '').trim().slice(0, 20);
}
function normalizeAge(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 3);
}
function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
}
function validateProfile(profile) {
    if (!profile.respondentName.trim())
        return '请填写姓名';
    if (!profile.respondentAge.trim())
        return '请填写年龄';
    const age = Number(profile.respondentAge);
    if (!Number.isFinite(age) || age <= 0 || age > 120)
        return '请填写有效年龄';
    if (!/^1\d{10}$/.test(profile.respondentPhone.trim()))
        return '请填写正确联系电话';
    return '';
}
function isProfileComplete(p) {
    var _a, _b, _c;
    return !!(((_a = p.respondentName) === null || _a === void 0 ? void 0 : _a.trim()) &&
        ((_b = p.respondentAge) === null || _b === void 0 ? void 0 : _b.trim()) &&
        p.respondentGender &&
        /^1\d{10}$/.test(((_c = p.respondentPhone) === null || _c === void 0 ? void 0 : _c.trim()) || ''));
}
function getShakeFields(profile) {
    return {
        respondentName: !(profile.respondentName || '').trim(),
        respondentAge: !(profile.respondentAge || '').trim(),
        respondentPhone: !/^1\d{10}$/.test((profile.respondentPhone || '').trim()),
        respondentGender: false,
    };
}
function buildReferralHint(referralCode) {
    return referralCode ? `已带入邀请码 ${referralCode}` : '';
}
function getProgress(index, total) {
    if (!total || total <= 0) {
        return 0;
    }
    return Math.round((((index + 1) / total) * 1000)) / 10;
}
function buildHistoryView(history) {
    return history.map((record) => {
        const meta = riskMeta(record.riskLevel || computeRiskLevel(record.score));
        return {
            ...record,
            createdAtText: fmtTime(record.createdAt),
            riskText: meta.text,
            riskColor: meta.color,
        };
    });
}
function resolveLeadState(leadId, status) {
    const normalizedLeadId = String(leadId || '').trim();
    const normalizedStatus = status || (normalizedLeadId ? 'NEW' : null);
    return {
        leadIdText: normalizedLeadId || '--',
        leadStatusText: leadStatusLabel(normalizedStatus),
    };
}
function buildAppointmentUrl() {
    return `/pages/appointment/index?title=${encodeURIComponent(APPOINTMENT_TITLE)}&subtitle=${encodeURIComponent(APPOINTMENT_SUBTITLE)}`;
}
Page({
    data: {
        loading: true,
        loadingText: '加载中...',
        error: '',
        mode: 'UNASSESSED',
        role: roleStore.getState().role,
        surveyStage: 'PROFILE',
        questions: SAFETY_QUESTIONS,
        currentIndex: 0,
        answers: {},
        progress: getProgress(0, SAFETY_QUESTIONS.length),
        canNext: false,
        profile: buildInitialProfile(),
        pendingReferralCode: '',
        pendingReferralHint: '',
        latest: null,
        history: [],
        risk: DEFAULT_RISK,
        suggestions: [],
        leadStatusText: '未生成线索',
        leadIdText: '--',
        visible: {
            btnMakeAppointment: false,
        },
        isProfileReady: false,
        shakeFields: {
            respondentName: false,
            respondentAge: false,
            respondentPhone: false,
            respondentGender: false,
        },
    },
    onLoad(options) {
        const capturedCode = capturePendingReferralCode(options === null || options === void 0 ? void 0 : options.referralCode);
        if (capturedCode) {
            this.setData({
                pendingReferralCode: capturedCode,
                pendingReferralHint: buildReferralHint(capturedCode),
            });
        }
        this.__unsub = roleStore.subscribe((role) => {
            this.setData({ role });
            this.refreshVisibility();
        });
        void this.init();
    },
    onShow() {
        void this.init();
    },
    onUnload() {
        const u = this.__unsub;
        if (typeof u === 'function')
            u();
    },
    async init() {
        this.setData({ loading: true, loadingText: '加载中...', error: '' });
        try {
            await this.loadAssessedIfAny();
            this.refreshVisibility();
            this.setData({ loading: false });
        }
        catch (e) {
            this.setData({ loading: false, error: typeof (e === null || e === void 0 ? void 0 : e.message) === 'string' ? e.message : '加载失败' });
        }
    },
    refreshVisibility() {
        const role = this.data.role;
        this.setData({
            visible: {
                btnMakeAppointment: canAccess(role, 'btn.makeAppointment'),
            },
        });
    },
    async loadAssessedIfAny() {
        const [{ leadId, status }, { history }] = await Promise.all([
            getLeadStatus(),
            getSafetyHistory(3),
        ]);
        if (history.length > 0) {
            const latest = history[0];
            const meta = riskMeta(latest.riskLevel || computeRiskLevel(latest.score));
            this.setData({
                mode: 'ASSESSED',
                latest,
                risk: { color: meta.color, icon: meta.icon, text: meta.text },
                suggestions: meta.suggestions,
                history: buildHistoryView(history),
                ...resolveLeadState(leadId, status),
            });
            return;
        }
        this.resetUnassessed();
    },
    resetUnassessed() {
        const pendingReferralCode = getPendingReferralCode() || this.data.pendingReferralCode || '';
        const initialProfile = buildInitialProfile();
        this.setData({
            mode: 'UNASSESSED',
            surveyStage: 'PROFILE',
            currentIndex: 0,
            answers: {},
            progress: getProgress(0, this.data.questions.length),
            canNext: false,
            profile: initialProfile,
            isProfileReady: isProfileComplete(initialProfile),
            pendingReferralCode,
            pendingReferralHint: buildReferralHint(pendingReferralCode),
            latest: null,
            history: [],
            risk: DEFAULT_RISK,
            suggestions: [],
            leadStatusText: '未生成线索',
            leadIdText: '--',
        });
    },
    onRetry() {
        void this.init();
    },
    onProfileInput(e) {
        var _a, _b, _c, _d, _e;
        const field = String(((_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.field) || '');
        const rawValue = String(((_c = e === null || e === void 0 ? void 0 : e.detail) === null || _c === void 0 ? void 0 : _c.value) || ((_e = (_d = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _d === void 0 ? void 0 : _d.dataset) === null || _e === void 0 ? void 0 : _e.value) || '');
        const nextProfile = { ...this.data.profile };
        if (field === 'respondentName') {
            nextProfile.respondentName = normalizeName(rawValue);
        }
        if (field === 'respondentAge') {
            nextProfile.respondentAge = normalizeAge(rawValue);
        }
        if (field === 'respondentPhone') {
            nextProfile.respondentPhone = normalizePhone(rawValue);
        }
        if (field === 'respondentGender') {
            nextProfile.respondentGender = rawValue === 'female' ? 'female' : 'male';
        }
        this.setData({
            profile: nextProfile,
            isProfileReady: isProfileComplete(nextProfile),
            shakeFields: { respondentName: false, respondentAge: false, respondentPhone: false, respondentGender: false },
        });
    },
    onStartSurvey() {
        if (!requireLogin({
            title: '登录后开始测评',
            content: '居家安全自查当前仅供预览，登录后可继续答题并生成结果。',
        }))
            return;
        const error = validateProfile(this.data.profile);
        if (error) {
            const shakeFields = getShakeFields(this.data.profile);
            this.setData({ shakeFields });
            wx.showToast({ title: error, icon: 'none' });
            setTimeout(() => {
                this.setData({
                    shakeFields: { respondentName: false, respondentAge: false, respondentPhone: false, respondentGender: false },
                });
            }, 600);
            return;
        }
        const currentQuestion = this.data.questions[0];
        this.setData({
            surveyStage: 'QUESTIONS',
            currentIndex: 0,
            progress: getProgress(0, this.data.questions.length),
            canNext: typeof this.data.answers[currentQuestion.id] === 'number',
        });
    },
    onPick(e) {
        var _a, _b, _c, _d;
        if (!requireLogin({
            title: '登录后开始测评',
            content: '居家安全自查当前仅供预览，登录后可继续答题并生成结果。',
        }))
            return;
        const qid = (_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.qid;
        const value = Number((_d = (_c = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.value);
        if (!qid || Number.isNaN(value))
            return;
        const answers = { ...this.data.answers, [qid]: value };
        const currentQuestion = this.data.questions[this.data.currentIndex];
        const currentQuestionId = currentQuestion === null || currentQuestion === void 0 ? void 0 : currentQuestion.id;
        this.setData({
            answers,
            canNext: Boolean(currentQuestionId) && typeof answers[currentQuestionId] === 'number',
        });
    },
    onPrev() {
        if (this.data.currentIndex === 0) {
            this.setData({
                surveyStage: 'PROFILE',
                progress: getProgress(0, this.data.questions.length),
                canNext: false,
            });
            return;
        }
        const index = Math.max(0, this.data.currentIndex - 1);
        const currentQuestion = this.data.questions[index];
        this.setData({
            currentIndex: index,
            progress: getProgress(index, this.data.questions.length),
            canNext: typeof this.data.answers[currentQuestion.id] === 'number',
        });
    },
    async onNextOrSubmit() {
        if (!requireLogin({
            title: '登录后开始测评',
            content: '居家安全自查当前仅供预览，登录后可继续答题并生成结果。',
        }))
            return;
        const index = this.data.currentIndex;
        const isLastQuestion = index === this.data.questions.length - 1;
        if (!isLastQuestion) {
            const nextIndex = index + 1;
            const nextQuestion = this.data.questions[nextIndex];
            this.setData({
                currentIndex: nextIndex,
                progress: getProgress(nextIndex, this.data.questions.length),
                canNext: typeof this.data.answers[nextQuestion.id] === 'number',
            });
            return;
        }
        const answers = this.data.questions.map((question) => {
            var _a;
            return ({
                qid: question.id,
                value: (_a = this.data.answers[question.id]) !== null && _a !== void 0 ? _a : 0,
            });
        });
        const profileForm = this.data.profile;
        const profileError = validateProfile(profileForm);
        if (profileError) {
            wx.showToast({ title: profileError, icon: 'none' });
            this.setData({ surveyStage: 'PROFILE' });
            return;
        }
        const profile = {
            respondentName: profileForm.respondentName.trim(),
            respondentGender: profileForm.respondentGender,
            respondentAge: Number(profileForm.respondentAge),
            respondentPhone: profileForm.respondentPhone.trim(),
        };
        this.setData({ loading: true, loadingText: '正在进行评分，请稍后', error: '' });
        wx.showLoading({ title: '正在进行评分，请稍后', mask: true });
        try {
            const result = await submitSafetyCheck(answers, profile);
            const latest = result.record;
            const meta = riskMeta(latest.riskLevel || computeRiskLevel(latest.score));
            const latestHistory = buildHistoryView([latest])[0];
            this.setData({
                mode: 'ASSESSED',
                latest,
                risk: { color: meta.color, icon: meta.icon, text: meta.text },
                suggestions: meta.suggestions,
                history: [latestHistory, ...(this.data.history || [])].slice(0, 3),
                ...resolveLeadState(result.leadId || null, result.leadId ? 'NEW' : null),
            });
            // 标记已完成测评，后续不再弹窗
            markAssessmentCompleted();
            await pushSystemNotice({
                title: `居家安全自查{${meta.text}}`,
                content: '建议立即预约专业上门评估排查风险',
            });
            wx.showToast({ title: '已生成测评结果', icon: 'success' });
            void this.loadAssessedIfAny();
        }
        catch (e) {
            wx.showToast({
                title: getErrorMessage(e, '提交失败'),
                icon: 'none',
            });
        }
        finally {
            wx.hideLoading();
            this.setData({ loading: false });
        }
    },
    onReAssess() {
        if (!requireLogin({
            title: '登录后重新测评',
            content: '测评记录仅支持登录后操作。',
        }))
            return;
        showAppModal({
            title: '重新测评',
            content: '重新测评会生成新的记录，是否继续？',
            confirmText: '继续',
            success: (res) => {
                if (!res.confirm)
                    return;
                this.setData({
                    mode: 'UNASSESSED',
                    surveyStage: 'PROFILE',
                    currentIndex: 0,
                    answers: {},
                    progress: getProgress(0, this.data.questions.length),
                    canNext: false,
                    latest: null,
                    history: [],
                    risk: DEFAULT_RISK,
                    suggestions: [],
                    leadStatusText: '未生成线索',
                    leadIdText: '--',
                });
            },
        });
    },
    onMakeAppointment() {
        if (!requireLogin({
            title: '登录后预约评估',
            content: '预约上门评估仅支持登录后发起。',
        }))
            return;
        wx.navigateTo({ url: buildAppointmentUrl() });
    },
});
