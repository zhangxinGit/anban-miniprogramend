import { staffRequest } from '../utils/staffRequest'
import type { FallRiskSection } from '../shared/fallRiskSurvey'
import { isSmartQuestion } from '../shared/fallRiskSurvey'

type ServerSection = {
  key: string
  title: string
  questions: Array<{
    id: string
    text: string
    productTag?: string | null
  }>
}

/**
 * 从后端获取启用中的评估题目（仅返回 isActive=1 的题目）。
 * 注意：仍保留 shared/fallRiskSurvey.ts 中的常量作为 fallback，
 * 若后端不可用时回退到硬编码题目。
 */
export async function fetchActiveSections(): Promise<FallRiskSection[]> {
  const resp = await staffRequest<ServerSection[]>({
    url: '/api/admin/fall-risk-questions',
    method: 'GET',
  })
  if (!resp.ok) {
    throw new Error(resp.message || '加载评估题目失败')
  }
  return (resp.data || []).map((section) => ({
    key: section.key,
    title: section.title,
    questions: (section.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      productTag: q.productTag ?? undefined,
    })),
  }))
}

/** 统计已启用的题目总数 */
export function countActiveQuestions(sections: FallRiskSection[]): number {
  return sections.reduce((total, section) => total + section.questions.length, 0)
}
