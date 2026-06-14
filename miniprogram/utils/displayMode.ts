import { displayModeStore, type DisplayMode } from '../store/displayModeStore';

export type DisplayModeData = {
  displayMode: DisplayMode;
  displayModeClass: string;
  isAgedMode: boolean;
};

type AnyPageOptions = WechatMiniprogram.Page.Options<Record<string, any>, Record<string, any>>;

export function resolveDisplayModeClass(mode: DisplayMode): string {
  return mode === 'aged' ? 'display-mode-aged' : 'display-mode-standard';
}

export function resolveDisplayModeData(mode: DisplayMode): DisplayModeData {
  return {
    displayMode: mode,
    displayModeClass: resolveDisplayModeClass(mode),
    isAgedMode: mode === 'aged',
  };
}

export function withDisplayModePage<T extends AnyPageOptions>(options: T): T {
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
    onLoad(this: WechatMiniprogram.Page.Instance<any, any>, query: Record<string, string | undefined>) {
      const applyMode = (mode: DisplayMode) => {
        this.setData(resolveDisplayModeData(mode));
        const tabBar = (this as any).getTabBar?.();
        if (tabBar?.setDisplayMode) {
          tabBar.setDisplayMode(mode);
        }
      };
      (this as any).__ab_display_mode_unsub = displayModeStore.subscribe(applyMode);
      if (typeof originalOnLoad === 'function') {
        originalOnLoad.call(this, query);
      }
    },
    onShow(this: WechatMiniprogram.Page.Instance<any, any>) {
      const tabBar = (this as any).getTabBar?.();
      if (tabBar?.setDisplayMode) {
        tabBar.setDisplayMode(displayModeStore.getState().mode);
      }
      if (typeof originalOnShow === 'function') {
        originalOnShow.call(this);
      }
    },
    onUnload(this: WechatMiniprogram.Page.Instance<any, any>) {
      const unsubscribe = (this as any).__ab_display_mode_unsub;
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (typeof originalOnUnload === 'function') {
        originalOnUnload.call(this);
      }
    },
  } as T;
}