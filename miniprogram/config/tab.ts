import type { UserRole } from '../shared/roles';
import { USER_ROLES } from '../shared/roles';

export type TabKey = 'home' | 'device' | 'suitable' | 'service' | 'mine';

export type TabItem = {
  key: TabKey;
  text: string;
  pagePath: string;
  icon: string;
  iconActive: string;
  iconSrc?: string;
  iconActiveSrc?: string;
};

export const TAB_ITEMS: Record<TabKey, TabItem> = {
  home: {
    key: 'home',
    text: '首页',
    pagePath: '/pages/home/index',
    icon: '⌂',
    iconActive: '⌂',
    iconSrc: '/assets/tab/home.png',
    iconActiveSrc: '/assets/tab/home_select.png',
  },
  device: {
    key: 'device',
    text: '设备',
    pagePath: '/pages/service/index',
    icon: '☰',
    iconActive: '☰',
    iconSrc: '/assets/tab/device.png',
    iconActiveSrc: '/assets/tab/device_select.png',
  },
  suitable: {
    key: 'suitable',
    text: '好物',
    pagePath: '/pages/suitable-products/index',
    icon: '♥',
    iconActive: '♥',
  },
  service: {
    key: 'service',
    text: '服务',
    pagePath: '/pages/service-market/index',
    icon: '✦',
    iconActive: '✦',
    iconSrc: '/assets/tab/service.png',
    iconActiveSrc: '/assets/tab/service_select.png',
  },
  mine: {
    key: 'mine',
    text: '我的',
    pagePath: '/pages/mine/index',
    icon: '☺',
    iconActive: '☺',
    iconSrc: '/assets/tab/mine.png',
    iconActiveSrc: '/assets/tab/mine_select.png',
  },
} as const;

export function getTabsByRole(role: UserRole): TabItem[] {
  if (role === USER_ROLES.VISITOR || role === USER_ROLES.OPERATOR || role === USER_ROLES.ADMIN) {
    return [TAB_ITEMS.home, TAB_ITEMS.device, TAB_ITEMS.suitable, TAB_ITEMS.service, TAB_ITEMS.mine];
  }
  return [TAB_ITEMS.home, TAB_ITEMS.device, TAB_ITEMS.suitable, TAB_ITEMS.service, TAB_ITEMS.mine];
}

