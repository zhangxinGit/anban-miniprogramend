import { request } from '../utils/request';
import { setBoundPhone, setRefreshToken, setToken, setTokenExpiresAt, setUserId } from '../utils/auth';
import { syncMe } from './appMe';
import { FORCE_MOCK } from '../config/mock';
export async function bindPhone(phone) {
    const p = (phone || '').trim();
    if (!/^1[3-9]\d{9}$/.test(p)) {
        throw new Error('请输入11位有效手机号');
    }
    if (FORCE_MOCK) {
        // 纯前端联调：仅写入 boundPhone，并刷新本地会话
        const token = `mock_bind_${Date.now()}`;
        setUserId(`mock_u_${p}`);
        setToken(token);
        setRefreshToken(token);
        setTokenExpiresAt(Date.now() + 2 * 60 * 60 * 1000);
        setBoundPhone(p);
        await syncMe().catch(() => { });
        return;
    }
    const resp = await request({
        url: '/api/app/identity/bindPhone',
        method: 'POST',
        data: { phone: p },
    });
    if (!resp.ok)
        throw new Error(resp.message || '绑定失败');
    setUserId(String(resp.data.user_id));
    setToken(resp.data.access_token);
    setRefreshToken(resp.data.refresh_token);
    const expiresIn = Number(resp.data.expires_in) || 0;
    setTokenExpiresAt(expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);
    setBoundPhone(p);
    await syncMe().catch(() => { });
}
