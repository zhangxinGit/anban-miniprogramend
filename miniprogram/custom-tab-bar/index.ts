import { roleStore } from '../store/roleStore';
import { getTabsByRole, type TabItem } from '../config/tab';

Component({
  data: {
    tabs: [] as TabItem[],
    selected: '',
    unread: 0,
  },
  lifetimes: {
    attached() {
      const unsubscribe = roleStore.subscribe((role) => {
        this.setData({ tabs: getTabsByRole(role) });
        this.setSelectedByRoute();
      });
      (this as any).__ab_unsub = unsubscribe;
      this.setSelectedByRoute();
    },
    detached() {
      const u = (this as any).__ab_unsub;
      if (typeof u === 'function') u();
    },
  },
  methods: {
    setSelectedByRoute() {
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      const route = cur ? `/${(cur as any).route}` : '';
      this.setData({ selected: route });
    },
    setUnread(unread: number) {
      this.setData({ unread: Math.max(0, unread | 0) });
    },
    onTap(e: any) {
      const path = e?.currentTarget?.dataset?.path;
      if (!path) return;
      if (path === this.data.selected) return;
      wx.switchTab({ url: path });
    },
  },
});

