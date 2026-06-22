import { fallRiskLevelMeta } from '../../shared/fallRiskSurvey';
import { fetchStaffAssessmentDetail } from '../../services/staffAssessment';
import { ensureStaffSession } from '../../utils/staffAuth';
function formatTime(value) {
    if (!value)
        return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
function toViewDetail(detail) {
    const meta = fallRiskLevelMeta(detail.risk_level === 'high' ? 'high' : detail.risk_level === 'medium' ? 'medium' : 'low');
    const questionCount = (detail.sections || []).reduce((sum, section) => { var _a; return sum + (((_a = section.questions) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
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
function wrapText(text, maxChars) {
    const normalized = String(text || '').trim();
    if (!normalized)
        return [''];
    const lines = [];
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
        detail: null,
    },
    onLoad(query) {
        const id = Number(query === null || query === void 0 ? void 0 : query.id);
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '加载报告失败';
            wx.showToast({ title: message, icon: 'none' });
        }
        finally {
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
        if (this.data.saving || !this.data.detail)
            return;
        this.setData({ saving: true });
        wx.showLoading({ title: '生成图片中' });
        try {
            await this.drawPoster(this.data.detail);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '保存图片失败';
            wx.showToast({ title: message, icon: 'none' });
        }
        finally {
            wx.hideLoading();
            this.setData({ saving: false });
        }
    },
    async drawPoster(detail) {
        const ctx = wx.createCanvasContext('reportPoster', this);
        const width = 750;
        // 计算海报动态高度
        let estimatedHeight = 400; // header + margin
        estimatedHeight += 6 * 34; // info lines
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
        infoLines.forEach((line) => {
            ctx.fillText(line, 52, cursorY);
            cursorY += 34;
        });
        cursorY += 16;
        ctx.setFontSize(24);
        ctx.fillText('命中风险项', 52, cursorY);
        cursorY += 40;
        ctx.setFontSize(18);
        const riskSlice = detail.risk_items.slice(0, 12);
        if (riskSlice.length === 0) {
            ctx.fillText('本次未命中风险项', 52, cursorY);
            cursorY += 28;
        }
        else {
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
            }
            else {
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
        await new Promise((resolve) => {
            ctx.draw(false, () => resolve());
        });
        const tempFilePath = await new Promise((resolve, reject) => {
            wx.canvasToTempFilePath({
                canvasId: 'reportPoster',
                destWidth: width,
                destHeight: height,
                fileType: 'png',
                success: (res) => resolve(res.tempFilePath),
                fail: (error) => reject(error),
            }, this);
        });
        try {
            await new Promise((resolve, reject) => {
                wx.saveImageToPhotosAlbum({
                    filePath: tempFilePath,
                    success: () => resolve(),
                    fail: (error) => reject(error),
                });
            });
            wx.showToast({ title: '已保存到相册', icon: 'success' });
        }
        catch (error) {
            const errMsg = typeof (error === null || error === void 0 ? void 0 : error.errMsg) === 'string' ? error.errMsg : '';
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
