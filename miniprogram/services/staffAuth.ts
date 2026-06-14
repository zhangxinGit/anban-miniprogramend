import { request } from '../utils/request';
import { setStaffSession } from '../utils/staffAuth';
import { staffRequest } from '../utils/staffRequest';

type StaffLoginResponse = {
  admin_id: number;
  role: string;
  token: string;
  username?: string | null;
  name?: string | null;
};

export async function loginStaffAccount(phone: string, password: string): Promise<StaffLoginResponse> {
  const normalizedPhone = (phone || '').trim();
  const normalizedPassword = (password || '').trim();
  if (normalizedPhone.length !== 11) {
    throw new Error('请输入11位手机号');
  }
  if (!normalizedPassword) {
    throw new Error('请输入密码');
  }

  const resp = await staffRequest<StaffLoginResponse>({
    url: '/api/admin/auth/login',
    method: 'POST',
    auth: false,
    data: { username: normalizedPhone, password: normalizedPassword },
  });

  if (!resp.ok) {
    throw new Error(resp.message || '登录失败');
  }

  setStaffSession({
    token: resp.data.token,
    adminId: resp.data.admin_id,
    role: resp.data.role,
    username: resp.data.username || normalizedPhone,
    name: resp.data.name || '',
  });

  return resp.data;
}

export async function exchangeStaffSessionFromApp(): Promise<StaffLoginResponse> {
  const resp = await request<StaffLoginResponse>({
    url: '/api/app/auth/staff-session',
    method: 'POST',
  });

  if (!resp.ok) {
    throw new Error(resp.message || '当前账号未开通工作台');
  }

  setStaffSession({
    token: resp.data.token,
    adminId: resp.data.admin_id,
    role: resp.data.role,
    username: resp.data.username || '',
    name: resp.data.name || '',
  });

  return resp.data;
}