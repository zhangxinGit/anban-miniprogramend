import { fallRiskLevelMeta } from '../../shared/fallRiskSurvey';
import { fetchStaffAssessmentDetail, type StaffAssessmentDetail } from '../../services/staffAssessment';
import { ensureStaffSession } from '../../utils/staffAuth';

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
  return {
    ...detail,
    phoneText: String(detail.phone || '').trim() || '—',
    timeText: formatTime(detail.created_at),
    riskLabel: meta.label,
    riskTone: meta.tone,
    riskDescription: meta.description,
    questionCount,
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
  },

  onLoad(query: Query) {
    const id = Number(query?.id);
    this.setData({ id: Number.isFinite(id) && id > 0 ? id : 0 });
  },

  async onShow() {
    const id = Number(this.data.id);
    const redirectUrl = `/pages/staff-assessment-report/index?id=${id}`;
    if (!id || !(await ensureStaffSession(redirectUrl))) {
      return;
    }
    void this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const detail = await fetchStaffAssessmentDetail(Number(this.data.id));
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
    const height = 1240;
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

    ctx.setFillStyle('#ffffff');
    ctx.fillRect(28, 208, 694, 972);
    ctx.setStrokeStyle('rgba(21,147,77,0.12)');
    ctx.strokeRect(28, 208, 694, 972);

    ctx.setFillStyle('#17311f');
    ctx.setFontSize(24);
    ctx.fillText('基础信息', 52, 252);
    ctx.setFontSize(18);
    const infoLines = [
      `性别：${detail.gender}`,
      `年龄：${detail.age} 岁`,
      `电话：${detail.phoneText}`,
      `社区：${detail.community}`,
      `地址：${detail.address}`,
      `工作人员：${detail.assessor_name}`,
    ];
    infoLines.forEach((line, index) => {
      ctx.fillText(line, 52, 290 + index * 34);
    });

    let cursorY = 520;
    ctx.setFontSize(24);
    ctx.fillText('命中风险项', 52, cursorY);
    cursorY += 34;
    ctx.setFontSize(18);
    detail.risk_items.slice(0, 8).forEach((item) => {
      wrapText(`• ${item}`, 28).forEach((line) => {
        ctx.fillText(line, 52, cursorY);
        cursorY += 28;
      });
    });

    cursorY += 10;
    ctx.setFontSize(24);
    ctx.fillText('改善建议', 52, cursorY);
    cursorY += 34;
    ctx.setFontSize(18);
    detail.suggestions.slice(0, 3).forEach((item) => {
      wrapText(`• ${item}`, 30).forEach((line) => {
        ctx.fillText(line, 52, cursorY);
        cursorY += 28;
      });
      cursorY += 8;
    });

    ctx.setFontSize(16);
    ctx.setFillStyle('#8a938c');
    ctx.fillText('安伴工作人员评估工作台自动生成', 52, 1140);

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