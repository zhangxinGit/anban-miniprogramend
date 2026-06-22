import { roleStore } from '../store/roleStore';
import { getTabsByRole } from '../config/tab';
Component({
    data: {
        tabs: [],
        selected: '',
        unread: 0,
    },
    lifetimes: {
        attached() {
            const unsubscribe = roleStore.subscribe((role) => {
                this.setData({ tabs: getTabsByRole(role) });
                this.setSelectedByRoute();
            });
            this.__ab_unsub = unsubscribe;
            this.setSelectedByRoute();
        },
        detached() {
            const u = this.__ab_unsub;
            if (typeof u === 'function')
                u();
        },
    },
    methods: {
        setSelectedByRoute() {
            const pages = getCurrentPages();
            const cur = pages[pages.length - 1];
            const route = cur ? `/${cur.route}` : '';
            this.setData({ selected: route });
        },
        setUnread(unread) {
            this.setData({ unread: Math.max(0, unread | 0) });
        },
        onTap(e) {
            var _a, _b;
            const path = (_b = (_a = e === null || e === void 0 ? void 0 : e.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.path;
            if (!path)
                return;
            if (path === this.data.selected)
                return;
            wx.switchTab({ url: path });
        },
    },
});
