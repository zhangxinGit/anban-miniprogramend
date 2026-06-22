import { staffRequest } from '../utils/staffRequest';

export type StaffAssessmentQuestionInput = {
  id: string;
  text: string;
  answer: boolean;
  productTag?: string;
};

export type StaffAssessmentSectionInput = {
  key: string;
  title: string;
  questions: StaffAssessmentQuestionInput[];
};

export type StaffAssessmentSubmitInput = {
  elder_name: string;
  gender: string;
  age: number;
  phone: string;
  address: string;
  community: string;
  emergency_contact_name?: string;
  emergency_contact_gender?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  emergency_contact_age?: number;
  emergency_contact_occupation?: string;
  children_count?: number;
  assessor_note?: string;
  sections: StaffAssessmentSectionInput[];
};

export type StaffAssessmentListItem = {
  id: number;
  elder_name: string;
  gender: string;
  age: number;
  phone: string;
  address: string;
  community: string;
  emergency_contact_name?: string | null;
  emergency_contact_gender?: string | null;
  emergency_contact_relation?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_age?: number | null;
  emergency_contact_occupation?: string | null;
  children_count?: number | null;
  assessor_note?: string | null;
  total_score: number;
  risk_level: string;
  assessor_admin_id: number;
  assessor_name: string;
  lead_id: number;
  created_at: string | null;
};

export type StaffAssessmentQuestion = {
  id: string;
  text: string;
  answer: boolean;
  productTag?: string;
};

export type StaffAssessmentSection = {
  key: string;
  title: string;
  questions: StaffAssessmentQuestion[];
};

export type StaffAssessmentDetail = StaffAssessmentListItem & {
  risk_items: string[];
  suggestions: string[];
  sections: StaffAssessmentSection[];
};

type Page<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export async function submitStaffAssessment(input: StaffAssessmentSubmitInput): Promise<StaffAssessmentDetail> {
  const resp = await staffRequest<StaffAssessmentDetail>({
    url: '/api/admin/fall-assessments',
    method: 'POST',
    data: input,
  });
  if (!resp.ok) {
    throw new Error(resp.message || '提交评估失败');
  }
  return resp.data;
}

export async function fetchStaffAssessments(q: {
  q?: string;
  riskLevel?: string;
  mine?: boolean;
  page?: number;
  size?: number;
}): Promise<Page<StaffAssessmentListItem>> {
  const params: string[] = [];
  if (q.q) params.push(`q=${encodeURIComponent(q.q)}`);
  if (q.riskLevel) params.push(`riskLevel=${encodeURIComponent(q.riskLevel)}`);
  if (q.mine) params.push('mine=true');
  params.push(`page=${q.page ?? 0}`);
  params.push(`size=${q.size ?? 20}`);
  const resp = await staffRequest<Page<StaffAssessmentListItem>>({
    url: `/api/admin/fall-assessments?${params.join('&')}`,
    method: 'GET',
  });
  if (!resp.ok) {
    throw new Error(resp.message || '加载评估列表失败');
  }
  return resp.data;
}

export async function fetchStaffAssessmentDetail(id: number): Promise<StaffAssessmentDetail> {
  const resp = await staffRequest<StaffAssessmentDetail>({
    url: `/api/admin/fall-assessments/${id}`,
    method: 'GET',
  });
  if (!resp.ok) {
    throw new Error(resp.message || '加载评估详情失败');
  }
  return resp.data;
}

/** 公开分享链接：无需 session 即可查看评估报告详情 */
export async function fetchPublicAssessmentDetail(id: number): Promise<StaffAssessmentDetail> {
  const resp = await staffRequest<StaffAssessmentDetail>({
    url: `/api/admin/fall-assessments/${id}`,
    method: 'GET',
    auth: false,
  });
  if (!resp.ok) {
    throw new Error(resp.message || '加载评估详情失败');
  }
  return resp.data;
}