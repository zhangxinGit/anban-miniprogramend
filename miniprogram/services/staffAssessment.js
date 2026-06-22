import { staffRequest } from '../utils/staffRequest';
export async function submitStaffAssessment(input) {
    const resp = await staffRequest({
        url: '/api/admin/fall-assessments',
        method: 'POST',
        data: input,
    });
    if (!resp.ok) {
        throw new Error(resp.message || '提交评估失败');
    }
    return resp.data;
}
export async function fetchStaffAssessments(q) {
    var _a, _b;
    const params = [];
    if (q.q)
        params.push(`q=${encodeURIComponent(q.q)}`);
    if (q.riskLevel)
        params.push(`riskLevel=${encodeURIComponent(q.riskLevel)}`);
    if (q.mine)
        params.push('mine=true');
    params.push(`page=${(_a = q.page) !== null && _a !== void 0 ? _a : 0}`);
    params.push(`size=${(_b = q.size) !== null && _b !== void 0 ? _b : 20}`);
    const resp = await staffRequest({
        url: `/api/admin/fall-assessments?${params.join('&')}`,
        method: 'GET',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '加载评估列表失败');
    }
    return resp.data;
}
export async function fetchStaffAssessmentDetail(id) {
    const resp = await staffRequest({
        url: `/api/admin/fall-assessments/${id}`,
        method: 'GET',
    });
    if (!resp.ok) {
        throw new Error(resp.message || '加载评估详情失败');
    }
    return resp.data;
}
/** 公开分享链接：无需 session 即可查看评估报告详情 */
export async function fetchPublicAssessmentDetail(id) {
    const resp = await staffRequest({
        url: `/api/admin/fall-assessments/${id}`,
        method: 'GET',
        auth: false,
    });
    if (!resp.ok) {
        throw new Error(resp.message || '加载评估详情失败');
    }
    return resp.data;
}
