import { request } from '../utils/request';
import { setBoundPhone, setRefreshToken, setToken, setTokenExpiresAt, setUserId } from '../utils/auth';
import { syncMe } from './appMe';
import { FORCE_MOCK } from '../config/mock';
import { roleStore } from '../store/roleStore';
import { USER_ROLES } from '../shared/roles';

export type DevAuthMode = 'PRE_DEAL' | 'DEAL_NO_DEVICE';

export async function devSkipLogin(mode: DevAuthMode = 'PRE_DEAL', phone?: string): Promise<boolean> {
  if (FORCE_MOCK) {
    // 纯前端联调：不打后端，直接模拟不同模式的角色态
    const p = (phone || '').trim() || (mode === 'DEAL_NO_DEVICE' ? '13900001004' : '13900001003');
    const token = `mock_dev_${mode}_${Date.now()}`;
    setUserId(`mock_dev_u_${p}`);
    setToken(token);
    setRefreshToken(token);
    setTokenExpiresAt(Date.now() + 24 * 60 * 60 * 1000);
    setBoundPhone(p);
    roleStore.setRole(mode === 'DEAL_NO_DEVICE' ? USER_ROLES.LEAD : USER_ROLES.VISITOR);
    await syncMe().catch(() => {});
    return true;
  }
  // 如果已经有 token，就不重复执行
  // 这里不读 getToken：避免循环依赖；直接靠 request header 判断也可
  const resp = await request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
    phone: string;
    role: string;
  }>({
    url: '/api/app/auth/dev/login',
    method: 'POST',
    data: { mode, phone: phone || '' },
  });
  if (!resp.ok) {
    throw new Error(resp.message || '开发版免登录失败：请确认后端已启动且不校验合法域名已开启');
  }

  setUserId(String(resp.data.user_id));
  setToken(resp.data.access_token);
  setRefreshToken(resp.data.refresh_token);
  const expiresIn = Number(resp.data.expires_in) || 0;
  setTokenExpiresAt(expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);
  if (resp.data.phone) setBoundPhone(String(resp.data.phone));
  await syncMe().catch(() => {});
  return true;
}

