import { displayModeStore } from '../store/displayModeStore';
export function resolveDisplayModeClass(mode) {
    return mode === 'aged' ? 'display-mode-aged' : 'display-mode-standard';
}
export function resolveDisplayModeData(mode) {
    return {
        displayMode: mode,
        displayModeClass: resolveDisplayModeClass(mode),
        isAgedMode: mode === 'aged',
    };
}
export function withDisplayModePage(options) {
    const originalOnLoad = options.onLoad;
    const originalOnShow = options.onShow;
    const originalOnUnload = options.onUnload;
    const initialData = resolveDisplayModeData(displayModeStore.getState().mode);
    return {
        ...options,
        data: {
            ...initialData,
            ...(options.data || {}),
        },
        onLoad(query) {
            const applyMode = (mode) => {
                var _a, _b;
                this.setData(resolveDisplayModeData(mode));
                const tabBar = (_b = (_a = this).getTabBar) === null || _b === void 0 ? void 0 : _b.call(_a);
                if (tabBar === null || tabBar === void 0 ? void 0 : tabBar.setDisplayMode) {
                    tabBar.setDisplayMode(mode);
                }
            };
            this.__ab_display_mode_unsub = displayModeStore.subscribe(applyMode);
            if (typeof originalOnLoad === 'function') {
                originalOnLoad.call(this, query);
            }
        },
        onShow() {
            var _a, _b;
            const tabBar = (_b = (_a = this).getTabBar) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (tabBar === null || tabBar === void 0 ? void 0 : tabBar.setDisplayMode) {
                tabBar.setDisplayMode(displayModeStore.getState().mode);
            }
            if (typeof originalOnShow === 'function') {
                originalOnShow.call(this);
            }
        },
        onUnload() {
            const unsubscribe = this.__ab_display_mode_unsub;
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
            if (typeof originalOnUnload === 'function') {
                originalOnUnload.call(this);
            }
        },
    };
}
