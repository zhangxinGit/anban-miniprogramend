import {
  loadFallRiskSurvey,
  computeFallRiskLevel,
  fallRiskLevelMeta,
  type FallRiskLevel,
  type FallRiskSection,
} from '../../shared/fallRiskSurvey';
import { submitStaffAssessment, type StaffAssessmentSectionInput } from '../../services/staffAssessment';
import { ensureStaffSession } from '../../utils/staffAuth';

type QuestionAnswer = '' | 'yes' | 'no';

type SurveyQuestionItem = {
  id: string;
  text: string;
  answer: QuestionAnswer;
  productTag?: string;
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

function buildSections(survey: FallRiskSection[]): SurveySectionItem[] {
  return survey.map((section, index) => ({
    key: section.key,
    title: section.title,
    expanded: index === 0,
    doneCount: 0,
    questions: section.questions.map((question) => ({
      id: question.id,
      text: question.text,
      answer: '',
      productTag: question.productTag,
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
      productTag: question.productTag,
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
    contactName: '',
    contactGender: '男',
    contactRelation: '',
    contactPhone: '',
    contactAge: '',
    contactOccupation: '',
    childrenCount: '',
    assessorNote: '',
    sections: [] as SurveySectionItem[],
    totalQuestions: 0,
    answeredCount: 0,
    loadingQuestions: true,
    previewScore: 0,
    previewRiskLabel: fallRiskLevelMeta('low').label,
    previewRiskTone: fallRiskLevelMeta('low').tone,
    previewRiskDescription: fallRiskLevelMeta('low').description,
    submitting: false,
  },

  async onShow() {
    await ensureStaffSession('/pages/staff-assessment/index');
    if (this.data.loadingQuestions) {
      await this.loadSurvey();
    }
  },

  async loadSurvey() {
    try {
      const survey = await loadFallRiskSurvey();
      const sections = buildSections(survey);
      const totalQuestions = survey.reduce((sum, s) => sum + s.questions.length, 0);
      this.setData({ sections, totalQuestions, loadingQuestions: false });
    } catch {
      wx.showToast({ title: '加载题目失败', icon: 'none' });
      this.setData({ loadingQuestions: true });
    }
  },

  onFieldInput(e: InputEvent) {
    const field = String(e?.currentTarget?.dataset?.field || '');
    const value = typeof e?.detail?.value === 'string' ? e.detail.value : '';
    if (!field) return;
    if (field === 'age' || field === 'contactAge') {
      this.setData({ [field]: value.replace(/\D/g, '').slice(0, 3) });
      return;
    }
    if (field === 'phone' || field === 'contactPhone') {
      this.setData({ [field]: value.replace(/\D/g, '').slice(0, 11) });
      return;
    }
    if (field === 'childrenCount') {
      this.setData({ childrenCount: value.replace(/\D/g, '').slice(0, 2) });
      return;
    }
    if (field === 'assessorNote') {
      this.setData({ assessorNote: value.slice(0, 500) });
      return;
    }
    this.setData({ [field]: value } as Record<string, unknown>);
  },

  onSelectGender(e: SelectEvent) {
    const value = String(e?.currentTarget?.dataset?.value || '');
    if (!value) return;
    this.setData({ gender: value });
  },

  onSelectContactGender(e: SelectEvent) {
    const value = String(e?.currentTarget?.dataset?.value || '');
    if (!value) return;
    this.setData({ contactGender: value });
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
        emergency_contact_name: String(this.data.contactName || '').trim() || undefined,
        emergency_contact_gender: String(this.data.contactGender || '').trim() || undefined,
        emergency_contact_relation: String(this.data.contactRelation || '').trim() || undefined,
        emergency_contact_phone: String(this.data.contactPhone || '').trim() || undefined,
        emergency_contact_age: (this.data.contactAge || '') !== '' ? Number(this.data.contactAge) : undefined,
        emergency_contact_occupation: String(this.data.contactOccupation || '').trim() || undefined,
        children_count: (this.data.childrenCount || '') !== '' ? Number(this.data.childrenCount) : undefined,
        assessor_note: String(this.data.assessorNote || '').trim() || undefined,
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
      contactName: this.data.contactName,
      contactGender: this.data.contactGender,
      contactRelation: this.data.contactRelation,
      contactPhone: this.data.contactPhone,
      contactAge: this.data.contactAge,
      contactOccupation: this.data.contactOccupation,
      childrenCount: this.data.childrenCount,
      assessorNote: this.data.assessorNote,
      sections: this.data.sections,
      savedAt: Date.now(),
    };
    wx.setStorageSync('staff_assessment_draft', draft);
    wx.showToast({ title: '草稿已保存', icon: 'success' });
  },
});