import { installRouterGuard } from './router/guard';
import { roleStore } from './store/roleStore';
import { getRole, getToken } from './utils/auth';
import { syncMe } from './services/appMe';
import { FORCE_MOCK } from './config/mock';
import { ensureSeedFamily } from './services/familyProfile';
import { resetSessionClosed } from './utils/assessmentPopup';
import { markBackendReachable, installNetworkListener } from './utils/networkStatus';
App({
    onLaunch() {
        // 每次冷启动（含扫码进入）清除会话关闭标记，确保弹窗能正常触发
        resetSessionClosed();
        // 冷启动时清除上一次会话可能残留的网络熔断标记，避免后端已恢复但请求仍被拦截
        try {
            wx.removeStorageSync('ab_backend_unreachable_until');
        }
        catch {
            // ignore
        }
        // 安装全局网络状态监听（用于离线提示 + 断网恢复自动清除熔断）
        installNetworkListener();
        ensureSeedFamily();
        // 初始化 role（来自本地缓存，含旧版角色迁移）
        roleStore.setRole(getRole());
        // 路由守卫要尽早安装（含"必须先微信认证"门禁）
        installRouterGuard();
        // mock/联调阶段：不依赖后端 /me
        if (FORCE_MOCK)
            return;
        // 后端单一真源：启动时同步一次，避免"前端推断角色"
        // （即使是 develop 环境，也不再自动免登录，避免绕过"先认证"门禁）
        if (getToken()) {
            syncMe().catch(() => {
                // ignore
            });
        }
    },
    /** 热启动（从后台切回/扫码唤醒）时也重置，保证每次扫码进入首页都弹窗 */
    onShow() {
        resetSessionClosed();
        // 从后台切回时也清除可能的熔断残留
        markBackendReachable();
    },
});
