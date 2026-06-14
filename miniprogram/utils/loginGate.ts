import { isLoggedIn } from './auth';
import { showAppModal } from './modal';

type LoginRedirectMode = 'switchTab' | 'navigateTo' | 'redirectTo' | 'reLaunch';

type LoginPromptOptions = {
  title?: string;
  content?: string;
  confirmText?: string;
  redirectMode?: LoginRedirectMode;
  redirectUrl?: string;
};

const DEFAULT_LOGIN_PAGE = '/pages/mine/index';

let loginPromptVisible = false;

function openLoginPage(mode: LoginRedirectMode, url: string) {
  if (mode === 'navigateTo') {
    wx.navigateTo({ url });
    return;
  }
  if (mode === 'redirectTo') {
    wx.redirectTo({ url });
    return;
  }
  if (mode === 'reLaunch') {
    wx.reLaunch({ url });
    return;
  }
  wx.switchTab({ url });
}

export function promptLogin(options: LoginPromptOptions = {}) {
  if (loginPromptVisible) {
    return;
  }

  loginPromptVisible = true;

  showAppModal({
    title: options.title || '请先登录',
    content: options.content || '当前功能仅可预览，登录后可继续操作。',
    confirmText: options.confirmText || '去登录',
    cancelText: '稍后再说',
    success: (result) => {
      if (!result.confirm) {
        return;
      }
      openLoginPage(options.redirectMode || 'switchTab', options.redirectUrl || DEFAULT_LOGIN_PAGE);
    },
    complete: () => {
      loginPromptVisible = false;
    },
  });
}

export function requireLogin(options: LoginPromptOptions = {}): boolean {
  if (isLoggedIn()) {
    return true;
  }

  promptLogin(options);
  return false;
}