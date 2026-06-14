import {
  FALL_RISK_SURVEY,
  computeFallRiskLevel,
  countFallRiskQuestions,
  fallRiskLevelMeta,
  type FallRiskLevel,
} from '../../shared/fallRiskSurvey';
import { submitStaffAssessment, type StaffAssessmentSectionInput } from '../../services/staffAssessment';
import { ensureStaffSession } from '../../utils/staffAuth';

type QuestionAnswer = '' | 'yes' | 'no';

type SurveyQuestionItem = {
  id: string;
  text: string;
  answer: QuestionAnswer;
};

type SurveySectionItem = {
  key: string;
  title: string;
  expanded: boolean;
  doneCount: number;
  questions: SurveyQuestionItem[];
};

type InputEvent = WechatMiniprogram.Input & {
  currentTarget?: {
    dataset?: {
      field?: string;
    };
  };
};

type SelectEvent = WechatMiniprogram.BaseEvent & {
  currentTarget?: {
    dataset?: {
      value?: string;
      sectionIndex?: string | number;
      questionIndex?: string | number;
      index?: string | number;
    };
  };
};

function buildSections(): SurveySectionItem[] {
  return FALL_RISK_SURVEY.map((section, index) => ({
    key: section.key,
    title: section.title,
    expanded: index === 0,
    doneCount: 0,
    questions: section.questions.map((question) => ({
      id: question.id,
      text: question.text,
      answer: '',
    })),
  }));
}

function countAnswered(sections: SurveySectionItem[]): number {
  return sections.reduce(
    (total, section) => total + section.questions.filter((question) => question.answer !== '').length,
    0
  );
}

function countScore(sections: SurveySectionItem[]): number {
  return sections.reduce(
    (total, section) => total + section.questions.filter((question) => question.answer === 'yes').length,
    0
  );
}

function toSubmitSections(sections: SurveySectionItem[]): StaffAssessmentSectionInput[] {
  return sections.map((section) => ({
    key: section.key,
    title: section.title,
    questions: section.questions.map((question) => ({
      id: question.id,
      text: question.text,
      answer: question.answer === 'yes',
    })),
  }));
}

function riskPreview(sections: SurveySectionItem[]): { score: number; level: FallRiskLevel; label: string; description: string } {
  const score = countScore(sections);
  const level = computeFallRiskLevel(score);
  const meta = fallRiskLevelMeta(level);
  return {
    score,
    level,
    label: meta.label,
    description: meta.description,
  };
}

Page({
  data: {
    elderName: '',
    gender: '男',
    age: '',
    phone: '',
    address: '',
    community: '',
    sections: buildSections() as SurveySectionItem[],
    totalQuestions: countFallRiskQuestions(),
    answeredCount: 0,
    previewScore: 0,
    previewRiskLabel: fallRiskLevelMeta('low').label,
    previewRiskTone: fallRiskLevelMeta('low').tone,
    previewRiskDescription: fallRiskLevelMeta('low').description,
    submitting: false,
  },

  async onShow() {
    await ensureStaffSession('/pages/staff-assessment/index');
  },

  onFieldInput(e: InputEvent) {
    const field = String(e?.currentTarget?.dataset?.field || '');
    const value = typeof e?.detail?.value === 'string' ? e.detail.value : '';
    if (!field) return;
    if (field === 'age') {
      this.setData({ age: value.replace(/\D/g, '').slice(0, 3) });
      return;
    }
    if (field === 'phone') {
      this.setData({ phone: value.replace(/\D/g, '').slice(0, 11) });
      return;
    }
    this.setData({ [field]: value } as Record<string, unknown>);
  },

  onSelectGender(e: SelectEvent) {
    const value = String(e?.currentTarget?.dataset?.value || '');
    if (!value) return;
    this.setData({ gender: value });
  },

  onToggleSection(e: SelectEvent) {
    const index = Number(e?.currentTarget?.dataset?.index);
    if (!Number.isFinite(index)) return;
    const sections = this.data.sections.map((section: SurveySectionItem, currentIndex: number) =>
      currentIndex === index ? { ...section, expanded: !section.expanded } : section
    );
    this.setData({ sections });
  },

  onSelectAnswer(e: SelectEvent) {
    const sectionIndex = Number(e?.currentTarget?.dataset?.sectionIndex);
    const questionIndex = Number(e?.currentTarget?.dataset?.questionIndex);
    const value = String(e?.currentTarget?.dataset?.value || '');
    if (!Number.isFinite(sectionIndex) || !Number.isFinite(questionIndex)) return;
    const sections = this.data.sections.map((section: SurveySectionItem, currentSectionIndex: number) => {
      if (currentSectionIndex !== sectionIndex) return section;
      const nextAnswer: QuestionAnswer = value === 'yes' ? 'yes' : 'no';
      const questions = section.questions.map((question, currentQuestionIndex) =>
        currentQuestionIndex === questionIndex ? { ...question, answer: nextAnswer } : question
      );
      return {
        ...section,
        questions,
        doneCount: questions.filter((question) => question.answer !== '').length,
      };
    });
    const preview = riskPreview(sections);
    this.setData({
      sections,
      answeredCount: countAnswered(sections),
      previewScore: preview.score,
      previewRiskLabel: preview.label,
      previewRiskTone: preview.level,
      previewRiskDescription: preview.description,
    });
  },

  validateForm(): string | null {
    if (!(this.data.elderName || '').trim()) return '请填写老人姓名';
    if (!(this.data.age || '').trim()) return '请填写年龄';
    if (!(this.data.phone || '').trim() || String(this.data.phone).trim().length !== 11) return '请填写11位联系电话';
    if (!(this.data.address || '').trim()) return '请填写家庭住址';
    if (!(this.data.community || '').trim()) return '请填写所属社区';
    if (countAnswered(this.data.sections) !== this.data.totalQuestions) return '请完成全部 32 项题目后再提交';
    return null;
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const error = this.validateForm();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const detail = await submitStaffAssessment({
        elder_name: String(this.data.elderName).trim(),
        gender: String(this.data.gender).trim(),
        age: Number(this.data.age),
        phone: String(this.data.phone).trim(),
        address: String(this.data.address).trim(),
        community: String(this.data.community).trim(),
        sections: toSubmitSections(this.data.sections),
      });
      wx.showToast({ title: '评估已生成', icon: 'success' });
      wx.redirectTo({ url: `/pages/staff-assessment-report/index?id=${detail.id}` });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '提交评估失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onSaveDraft() {
    const draft = {
      elderName: this.data.elderName,
      gender: this.data.gender,
      age: this.data.age,
      phone: this.data.phone,
      address: this.data.address,
      community: this.data.community,
      sections: this.data.sections,
      savedAt: Date.now(),
    };
    wx.setStorageSync('staff_assessment_draft', draft);
    wx.showToast({ title: '草稿已保存', icon: 'success' });
  },
});