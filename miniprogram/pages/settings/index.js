import { roleStore } from '../../store/roleStore';
import { displayModeStore } from '../../store/displayModeStore';
import { USER_ROLES } from '../../shared/roles';
import { clearAuth, getBoundPhone } from '../../utils/auth';
import { showAppModal } from '../../utils/modal';
import { resolveDisplayModeData } from '../../utils/displayMode';
import { maskPhone } from '../../utils/phone';
Page({
    data: {
        phoneMask: '当前账号',
    },
    onShow() {
        this.setData({
            phoneMask: maskPhone(getBoundPhone() || '', '当前账号'),
        });
    },
    onSwitchDisplayMode(e) {
        var _a, _b;
        const nextMode = ((_b = (_a = e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.mode) === 'standard' ? 'standard' : 'aged';
        this.setData(resolveDisplayModeData(nextMode));
        displayModeStore.setMode(nextMode);
    },
    onLogout() {
        showAppModal({
            title: '退出登录',
            content: '退出后将以游客身份浏览，可再次通过手机号登录。',
            confirmText: '退出登录',
            tone: 'danger',
            success: (res) => {
                if (!res.confirm) {
                    return;
                }
                clearAuth();
                roleStore.setRole(USER_ROLES.VISITOR);
                wx.switchTab({
                    url: '/pages/mine/index',
                    success: () => {
                        wx.showToast({ title: '已退出', icon: 'none' });
                    },
                });
            },
        });
    },
});
