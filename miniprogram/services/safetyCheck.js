import { roleStore } from '../store/roleStore';
import { USER_ROLES } from '../shared/roles';
import { getAuthState, isLoggedIn, setLeadId, setUserId } from '../utils/auth';
import { request } from '../utils/request';
import { isDevOfflineFallback } from '../utils/devFallback';
export function computeScore(answers) {
    return answers.reduce((sum, a) => sum + (a.value | 0), 0);
}
export function computeRiskLevel(score) {
    if (score <= 2)
        return 'LOW';
    if (score <= 5)
        return 'MEDIUM';
    return 'HIGH';
}
export function rebindSafetyRecordsToPhone(_phone) {
    // 生产：游客态测评归因在后端（X-Client-Id），登录后由后端按手机号读取；前端无需再合并本地数据
}
function uuid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
const LOCAL_KEYS = {
    recordsByKey: 'ab_dev_safety_records',
};
function localGetMap() {
    try {
        const v = wx.getStorageSync(LOCAL_KEYS.recordsByKey);
        if (v && typeof v === 'object')
            return v;
    }
    catch { }
    return {};
}
function localSetMap(m) {
    try {
        wx.setStorageSync(LOCAL_KEYS.recordsByKey, m);
    }
    catch { }
}
function localKey() {
    const st = getAuthState();
    if (isLoggedIn() && st.boundPhone)
        return `phone:${st.boundPhone.trim()}`;
    if (st.clientId)
        return `client:${st.clientId.trim()}`;
    return `anon:${st.leadId || 'x'}`;
}
export async function submitSafetyCheck(answers, profile) {
    // 开发离线兜底：后端不可用时，走本地存储，保证联调页面链路可跑通
    if (isDevOfflineFallback()) {
        const st = getAuthState();
        const userId = st.userId || uuid('u');
        if (!st.userId)
            setUserId(userId);
        const score = computeScore(answers);
        const record = {
            id: uuid('sr'),
            createdAt: Date.now(),
            score,
            riskLevel: computeRiskLevel(score),
            answers,
        };
        const k = localKey();
        const map = localGetMap();
        const list = map[k] || [];
        map[k] = [record, ...list].slice(0, 10);
        localSetMap(map);
        // 统一角色：未成交用户始终为 VISITOR（不再存在 LEAD）
        roleStore.setRole(USER_ROLES.VISITOR);
        return { role: USER_ROLES.VISITOR, leadId: st.leadId || '', userId, record };
    }
    const st = getAuthState();
    const userId = st.userId || uuid('u');
    if (!st.userId)
        setUserId(userId);
    const score = computeScore(answers);
    const resp = await request({
        url: '/api/app/safety/submit',
        method: 'POST',
        data: {
            answers_json: JSON.stringify(answers),
            score,
            respondent_name: profile.respondentName,
            respondent_gender: profile.respondentGender,
            respondent_age: profile.respondentAge,
            respondent_phone: profile.respondentPhone,
        },
    });
    if (!resp.ok)
        throw new Error(resp.message || '提交失败');
    // 统一角色：未成交用户始终为 VISITOR（不再存在 LEAD）
    const nextRole = USER_ROLES.VISITOR;
    roleStore.setRole(nextRole);
    const riskMap = {
        low: 'LOW',
        medium: 'MEDIUM',
        high: 'HIGH',
    };
    const record = {
        id: String(resp.data.assessment_id),
        createdAt: Date.now(),
        score: Number(resp.data.score) || score,
        riskLevel: riskMap[String(resp.data.risk_level || '').toLowerCase()] ||
            computeRiskLevel(Number(resp.data.score) || score),
        answers,
    };
    // leadId 仅用于前端展示/兼容；生产应以后端 lead_id 为准
    const leadId = resp.data.lead_id ? `lead_${resp.data.lead_id}` : (st.leadId || '');
    if (leadId && st.leadId !== leadId)
        setLeadId(leadId);
    return { role: nextRole, leadId, userId, record };
}
export async function getSafetyHistory(limit = 3) {
    if (isDevOfflineFallback()) {
        const k = localKey();
        const map = localGetMap();
        const list = (map[k] || []).slice(0, limit);
        return { leadId: getAuthState().leadId, history: list };
    }
    const resp = await request({
        url: '/api/app/safety/history',
        method: 'GET',
    });
    if (!resp.ok)
        return { leadId: null, history: [] };
    const riskMap = {
        low: 'LOW',
        medium: 'MEDIUM',
        high: 'HIGH',
    };
    const list = (resp.data || []).slice(0, limit).map((x) => {
        let answers = [];
        try {
            const v = JSON.parse(x.answers_json || '[]');
            if (Array.isArray(v))
                answers = v;
        }
        catch { }
        return {
            id: String(x.id),
            createdAt: x.created_at ? new Date(x.created_at).getTime() : Date.now(),
            score: Number(x.score) || computeScore(answers),
            riskLevel: riskMap[String(x.risk_level || '').toLowerCase()] || 'LOW',
            answers,
        };
    });
    return { leadId: getAuthState().leadId, history: list };
}
export async function getLeadStatus() {
    const { leadId, role } = getAuthState();
    if (!leadId)
        return { leadId: null, status: role === USER_ROLES.VISITOR ? null : 'NEW' };
    // 生产：线索状态由后端 lead.status 驱动；当前先维持最小闭环
    return { leadId, status: 'NEW' };
}
export function leadStatusLabel(status) {
    if (!status)
        return '未生成线索';
    switch (status) {
        case 'NEW':
            return '已生成线索（待跟进）';
        case 'FOLLOWING':
            return '跟进中';
        case 'APPOINTED':
            return '已预约上门';
        case 'DEAL':
            return '已成交';
        default:
            return '未知状态';
    }
}
