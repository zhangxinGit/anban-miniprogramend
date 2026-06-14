import { staffRequest } from '../utils/staffRequest';

export type StaffAssessmentQuestionInput = {
  id: string;
  text: string;
  answer: boolean;
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