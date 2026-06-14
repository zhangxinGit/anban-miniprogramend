import { request } from '../utils/request';

const STORAGE_KEY = 'ab_alarm_subscribe_state_v1';

type SubscribeTestPayload = {
  sent?: boolean;
  message?: string;
};

export type AlarmSubscribeStatus = 'unknown' | 'accepted' | 'rejected' | 'unavailable';

export type AlarmSubscribeState = {
  status: AlarmSubscribeStatus;
  message: string;
  updatedAt: number;
  acceptedTemplateIds: string[];
  rejectedTemplateIds: string[];
};

type SubscribeConfigPayload = {
  enabled?: boolean;
  template_ids?: string[];
  templateIds?: string[];
};

type SubscribeRequestResult = {
  errMsg?: string;
  [templateId: string]: unknown;
};

function buildState(partial?: Partial<AlarmSubscribeState>): AlarmSubscribeState {
  return {
    status: partial?.status || 'unknown',
    message: partial?.message || '',
    updatedAt: partial?.updatedAt || 0,
    acceptedTemplateIds: Array.isArray(partial?.acceptedTemplateIds) ? partial!.acceptedTemplateIds! : [],
    rejectedTemplateIds: Array.isArray(partial?.rejectedTemplateIds) ? partial!.rejectedTemplateIds! : [],
  };
}

function saveState(state: AlarmSubscribeState) {
  try {
    wx.setStorageSync(STORAGE_KEY, state);
  } catch {
    return;
  }
}

function normalizeTemplateIds(payload: SubscribeConfigPayload | undefined): string[] {
  const raw = Array.isArray(payload?.template_ids)
    ? payload!.template_ids!
    : Array.isArray(payload?.templateIds)
      ? payload!.templateIds!
      : [];
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  if (error && typeof error === 'object' && 'errMsg' in error && typeof (error as { errMsg?: unknown }).errMsg === 'string') {
    const errMsg = (error as { errMsg: string }).errMsg.trim();
    if (errMsg) return errMsg;
  }
  return '微信告警提醒授权失败，请稍后重试';
}

export function getAlarmSubscribeState(): AlarmSubscribeState {
  try {
    const value = wx.getStorageSync(STORAGE_KEY);
    if (value && typeof value === 'object') {
      return buildState(value as Partial<AlarmSubscribeState>);
    }
  } catch {
    return buildState();
  }
  return buildState();
}

export async function getAlarmSubscribeConfig(): Promise<{ enabled: boolean; templateIds: string[] }> {
  const resp = await request<SubscribeConfigPayload>({
    url: '/api/app/notifications/subscribe-config',
    method: 'GET',
  });
  if (!resp.ok) {
    throw new Error(resp.message || '读取告警提醒配置失败');
  }
  return {
    enabled: Boolean(resp.data?.enabled),
    templateIds: normalizeTemplateIds(resp.data),
  };
}

export async function requestAlarmSubscription(): Promise<AlarmSubscribeState> {
  const config = await getAlarmSubscribeConfig();
  if (!config.enabled || config.templateIds.length === 0) {
    const state = buildState({
      status: 'unavailable',
      message: '当前环境暂未开启微信告警提醒',
      updatedAt: Date.now(),
    });
    saveState(state);
    return state;
  }

  try {
    const result = await new Promise<SubscribeRequestResult>((resolve, reject) => {
      wx.requestSubscribeMessage({
        tmplIds: config.templateIds,
        success: (res) => resolve(res as SubscribeRequestResult),
        fail: reject,
      });
    });

    const acceptedTemplateIds: string[] = [];
    const rejectedTemplateIds: string[] = [];
    for (const templateId of config.templateIds) {
      const status = typeof result[templateId] === 'string' ? String(result[templateId]) : '';
      if (status === 'accept') {
        acceptedTemplateIds.push(templateId);
      } else if (status) {
        rejectedTemplateIds.push(templateId);
      }
    }

    const state = buildState({
      status: acceptedTemplateIds.length > 0 ? 'accepted' : 'rejected',
      message: acceptedTemplateIds.length > 0 ? '已开启微信告警提醒' : '你暂未开启微信告警提醒',
      updatedAt: Date.now(),
      acceptedTemplateIds,
      rejectedTemplateIds,
    });
    saveState(state);
    return state;
  } catch (error) {
    const state = buildState({
      status: 'unavailable',
      message: normalizeErrorMessage(error),
      updatedAt: Date.now(),
    });
    saveState(state);
    throw new Error(state.message);
  }
}

export async function sendAlarmSubscribeTest(): Promise<{ sent: boolean; message: string }> {
  const resp = await request<SubscribeTestPayload>({
    url: '/api/app/notifications/test-send',
    method: 'POST',
    data: {},
  });
  if (!resp.ok) {
    throw new Error(resp.message || '发送测试提醒失败');
  }
  return {
    sent: Boolean(resp.data?.sent),
    message: typeof resp.data?.message === 'string' && resp.data.message.trim()
      ? resp.data.message.trim()
      : '测试消息已提交给微信，请到服务通知中查看',
  };
}