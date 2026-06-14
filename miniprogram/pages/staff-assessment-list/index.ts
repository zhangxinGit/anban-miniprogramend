import { fallRiskLevelMeta } from '../../shared/fallRiskSurvey';
import { fetchStaffAssessments, type StaffAssessmentListItem } from '../../services/staffAssessment';
import { ensureStaffSession } from '../../utils/staffAuth';
import { maskPhone } from '../../utils/phone';

type Query = {
  mode?: string;
  title?: string;
};

type InputEvent = WechatMiniprogram.Input & {
  detail?: {
    value?: string;
  };
};

type SelectEvent = WechatMiniprogram.BaseEvent & {
  currentTarget?: {
    dataset?: {
      value?: string;
      id?: string | number;
    };
  };
};

type ListViewItem = StaffAssessmentListItem & {
  phoneMask: string;
  timeText: string;
  riskLabel: string;
  riskTone: string;
};

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function toViewItem(item: StaffAssessmentListItem): ListViewItem {
  const meta = fallRiskLevelMeta(item.risk_level === 'high' ? 'high' : item.risk_level === 'medium' ? 'medium' : 'low');
  return {
    ...item,
    phoneMask: maskPhone(item.phone, '—'),
    timeText: formatTime(item.created_at),
    riskLabel: meta.label,
    riskTone: meta.tone,
  };
}

Page({
  data: {
    title: '历史评估记录',
    mode: 'mine',
    q: '',
    riskLevel: '',
    loading: false,
    loadingMore: false,
    rows: [] as ListViewItem[],
    page: 0,
    total: 0,
    hasMore: true,
  },

  onLoad(query: Query) {
    const title = typeof query?.title === 'string' && query.title ? decodeURIComponent(query.title) : '历史评估记录';
    const mode = query?.mode === 'all' ? 'all' : 'mine';
    this.setData({ title, mode });
  },

  async onShow() {
    const redirectUrl = `/pages/staff-assessment-list/index?mode=${this.data.mode}&title=${encodeURIComponent(this.data.title)}`;
    if (!(await ensureStaffSession(redirectUrl))) {
      return;
    }
    void this.load(true);
  },

  async load(reset = false) {
    const nextPage = reset ? 0 : this.data.page;
    this.setData(reset ? { loading: true } : { loadingMore: true });
    try {
      const result = await fetchStaffAssessments({
        q: String(this.data.q || '').trim() || undefined,
        riskLevel: String(this.data.riskLevel || '').trim() || undefined,
        mine: this.data.mode === 'mine',
        page: nextPage,
        size: 20,
      });
      const incoming = (result.content || []).map(toViewItem);
      const rows = reset ? incoming : [...this.data.rows, ...incoming];
      this.setData({
        rows,
        page: nextPage + 1,
        total: result.totalElements || 0,
        hasMore: rows.length < (result.totalElements || 0),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onSearchInput(e: InputEvent) {
    this.setData({ q: typeof e?.detail?.value === 'string' ? e.detail.value : '' });
  },

  onSelectRisk(e: SelectEvent) {
    this.setData({ riskLevel: String(e?.currentTarget?.dataset?.value || '') });
  },

  onQuery() {
    void this.load(true);
  },

  onCreateNew() {
    wx.navigateTo({ url: '/pages/staff-assessment/index' });
  },

  onOpenDetail(e: SelectEvent) {
    const id = Number(e?.currentTarget?.dataset?.id);
    if (!Number.isFinite(id) || id <= 0) return;
    wx.navigateTo({ url: `/pages/staff-assessment-report/index?id=${id}` });
  },

  onReachBottom() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    void this.load(false);
  },
});