import { fallRiskLevelMeta } from '../../shared/fallRiskSurvey';
import { fetchStaffAssessmentDetail, fetchPublicAssessmentDetail, type StaffAssessmentDetail } from '../../services/staffAssessment';
import { ensureStaffSession, hasStaffSession } from '../../utils/staffAuth';

type Query = {
  id?: string;
};

type ViewDetail = StaffAssessmentDetail & {
  phoneText: string;
  timeText: string;
  riskLabel: string;
  riskTone: string;
  riskDescription: string;
  questionCount: number;
  contactNameText: string;
  contactGenderText: string;
  contactRelationText: string;
  contactPhoneText: string;
  contactAgeText: string;
  contactOccupationText: string;
  childrenCountText: string;
  assessorNoteText: string;
};

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function toViewDetail(detail: StaffAssessmentDetail): ViewDetail {
  const meta = fallRiskLevelMeta(detail.risk_level === 'high' ? 'high' : detail.risk_level === 'medium' ? 'medium' : 'low');
  const questionCount = (detail.sections || []).reduce((sum, section) => sum + (section.questions?.length || 0), 0);
  const contactName = String(detail.emergency_contact_name || '').trim();
  return {
    ...detail,
    phoneText: String(detail.phone || '').trim() || '—',
    timeText: formatTime(detail.created_at),
    riskLabel: meta.label,
    riskTone: meta.tone,
    riskDescription: meta.description,
    questionCount,
    contactNameText: contactName || '—',
    contactGenderText: String(detail.emergency_contact_gender || '').trim() || '—',
    contactRelationText: String(detail.emergency_contact_relation || '').trim() || '—',
    contactPhoneText: String(detail.emergency_contact_phone || '').trim() || '—',
    contactAgeText: detail.emergency_contact_age != null ? String(detail.emergency_contact_age) : '—',
    contactOccupationText: String(detail.emergency_contact_occupation || '').trim() || '—',
    childrenCountText: detail.children_count != null ? String(detail.children_count) : '—',
    assessorNoteText: String(detail.assessor_note || '').trim(),
  };
}

function wrapText(text: string, maxChars: number): string[] {
  const normalized = String(text || '').trim();
  if (!normalized) return [''];
  const lines: string[] = [];
  for (let index = 0; index < normalized.length; index += maxChars) {
    lines.push(normalized.slice(index, index + maxChars));
  }
  return lines;
}

Page({
  data: {
    id: 0,
    loading: true,
    saving: false,
    detail: null as ViewDetail | null,
    isPublic: false,
  },

  onLoad(query: Query) {
    const id = Number(query?.id);
    this.setData({ id: Number.isFinite(id) && id > 0 ? id : 0 });
    // 启用导航栏右上角分享按钮
    wx.showShareMenu({
      withShareTicket: false,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  async onShow() {
    const id = Number(this.data.id);
    if (!id) return;

    // 优先尝试工作人员登录态；若已有 session 则确保仍有效
    if (hasStaffSession()) {
      await ensureStaffSession(`/pages/staff-assessment-report/index?id=${id}`);
    }
    void this.load(!hasStaffSession());
  },

  async load(asPublic = false) {
    this.setData({ loading: true });
    try {
      const detail = asPublic
        ? await fetchPublicAssessmentDetail(Number(this.data.id))
        : await fetchStaffAssessmentDetail(Number(this.data.id));
      this.setData({ detail: toViewDetail(detail) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载报告失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onShareAppMessage() {
    const detail = this.data.detail;
    return {
      title: detail ? `${detail.elder_name} · ${detail.riskLabel}防跌倒评估报告` : '防跌倒评估报告',
      path: `/pages/staff-assessment-report/index?id=${this.data.id}`,
      imageUrl: '/assets/banner/home_popup_banner_assessment.png',
    };
  },

  onShareTimeline() {
    const detail = this.data.detail;
    return {
      title: detail ? `${detail.elder_name} · ${detail.riskLabel}防跌倒评估报告` : '防跌倒评估报告',
      query: `id=${this.data.id}`,
      imageUrl: '/assets/banner/home_popup_banner_assessment.png',
    };
  },

  onCreateNext() {
    wx.redirectTo({ url: '/pages/staff-assessment/index' });
  },

  onOpenList() {
    wx.navigateTo({ url: `/pages/staff-assessment-list/index?mode=mine&title=${encodeURIComponent('历史评估记录')}` });
  },

  async onSavePoster() {
    if (this.data.saving || !this.data.detail) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '生成图片中' });
    try {
      await this.drawPoster(this.data.detail);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存图片失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  async drawPoster(detail: ViewDetail) {
    const ctx = wx.createCanvasContext('reportPoster', this);
    const width = 750;

    // 计算海报动态高度
    let estimatedHeight = 400; // header + margin
    const hasContact = detail.contactNameText !== '—';
    const noteLines = detail.assessorNoteText ? Math.ceil(detail.assessorNoteText.length / 30) : 0;
    estimatedHeight += (hasContact ? 14 : 6) * 34; // info lines (with or without contact)
    if (noteLines > 0) {
      estimatedHeight += 36; // note title
      estimatedHeight += noteLines * 28; // note lines
    }
    estimatedHeight += 80; // risk items section header
    estimatedHeight += Math.min(detail.risk_items.length, 12) * 32;
    estimatedHeight += 80; // suggestions section header
    detail.suggestions.forEach((item) => {
      estimatedHeight += item.startsWith('【') ? 40 : 28;
    });
    estimatedHeight += 100; // footer
    const height = Math.max(1400, estimatedHeight + 60);

    ctx.setFillStyle('#f6faf7');
    ctx.fillRect(0, 0, width, height);

    ctx.setFillStyle('#15934d');
    ctx.fillRect(0, 0, width, 186);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(20);
    ctx.fillText('居家防跌倒评估报告', 36, 58);
    ctx.setFontSize(34);
    ctx.fillText(detail.elder_name, 36, 110);
    ctx.setFontSize(18);
    ctx.fillText(`${detail.riskLabel} · 总分 ${detail.total_score} · ${detail.timeText}`, 36, 146);

    let cursorY = 226;
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(28, 208, 694, height - 280);
    ctx.setStrokeStyle('rgba(21,147,77,0.12)');
    ctx.strokeRect(28, 208, 694, height - 280);

    ctx.setFillStyle('#17311f');
    ctx.setFontSize(24);
    ctx.fillText('基础信息', 52, cursorY);
    cursorY += 40;
    ctx.setFontSize(18);
    const infoLines = [
      `性别：${detail.gender}`,
      `年龄：${detail.age} 岁`,
      `电话：${detail.phoneText}`,
      `社区：${detail.community}`,
      `地址：${detail.address}`,
      `工作人员：${detail.assessor_name}`,
    ];
    if (hasContact) {
      infoLines.push(
        '',
        '—— 家属联系人 ——',
        `姓名：${detail.contactNameText}`,
        `性别：${detail.contactGenderText}`,
        `关系：${detail.contactRelationText}`,
        `电话：${detail.contactPhoneText}`,
        `年龄：${detail.contactAgeText} 岁`,
        `职业：${detail.contactOccupationText}`,
        `子女数：${detail.childrenCountText}`,
      );
    }
    infoLines.forEach((line) => {
      ctx.fillText(line, 52, cursorY);
      cursorY += 34;
    });

    if (detail.assessorNoteText) {
      cursorY += 16;
      ctx.setFontSize(24);
      ctx.fillText('评估人员备注', 52, cursorY);
      cursorY += 40;
      ctx.setFontSize(18);
      ctx.setFillStyle('#203021');
      wrapText(detail.assessorNoteText, 30).forEach((line) => {
        ctx.fillText(line, 52, cursorY);
        cursorY += 28;
      });
      ctx.setFillStyle('#17311f');
    }

    cursorY += 16;
    ctx.setFontSize(24);
    ctx.fillText('命中风险项', 52, cursorY);
    cursorY += 40;
    ctx.setFontSize(18);
    const riskSlice = detail.risk_items.slice(0, 12);
    if (riskSlice.length === 0) {
      ctx.fillText('本次未命中风险项', 52, cursorY);
      cursorY += 28;
    } else {
      riskSlice.forEach((item) => {
        wrapText(`• ${item}`, 30).forEach((line) => {
          ctx.fillText(line, 52, cursorY);
          cursorY += 28;
        });
      });
      if (detail.risk_items.length > 12) {
        ctx.fillText(`... 共 ${detail.risk_items.length} 项`, 52, cursorY);
        cursorY += 28;
      }
    }

    cursorY += 16;
    ctx.setFontSize(24);
    ctx.fillText('改善建议', 52, cursorY);
    cursorY += 40;
    ctx.setFontSize(18);
    ctx.setFillStyle('#15934d');
    detail.suggestions.forEach((item) => {
      if (item.startsWith('【') && item.endsWith('】')) {
        cursorY += 8;
        ctx.setFontSize(20);
        ctx.setFillStyle('#15934d');
        ctx.fillText(item, 52, cursorY);
        ctx.setFontSize(18);
        cursorY += 36;
      } else {
        ctx.setFillStyle('#203021');
        wrapText(`• ${item}`, 30).forEach((line) => {
          ctx.fillText(line, 52, cursorY);
          cursorY += 28;
        });
      }
    });

    ctx.setFontSize(16);
    ctx.setFillStyle('#8a938c');
    ctx.fillText('安伴工作人员评估工作台自动生成', 52, height - 60);

    await new Promise<void>((resolve) => {
      ctx.draw(false, () => resolve());
    });

    const tempFilePath = await new Promise<string>((resolve, reject) => {
      wx.canvasToTempFilePath(
        {
          canvasId: 'reportPoster',
          destWidth: width,
          destHeight: height,
          fileType: 'png',
          success: (res) => resolve(res.tempFilePath),
          fail: (error) => reject(error),
        },
        this
      );
    });

    try {
      await new Promise<void>((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: () => resolve(),
          fail: (error) => reject(error),
        });
      });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (error) {
      const errMsg = typeof (error as { errMsg?: unknown })?.errMsg === 'string' ? (error as { errMsg: string }).errMsg : '';
      if (errMsg.includes('auth deny') || errMsg.includes('authorize')) {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册，以便导出评估图片。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({});
            }
          },
        });
        return;
      }
      throw error instanceof Error ? error : new Error('保存图片失败');
    }
  },
});