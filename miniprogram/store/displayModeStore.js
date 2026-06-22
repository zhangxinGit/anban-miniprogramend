const DISPLAY_MODE_STORAGE_KEY = 'ab_display_mode_v1';
function normalizeDisplayMode(value) {
    return value === 'standard' ? 'standard' : 'aged';
}
class DisplayModeStore {
    constructor() {
        this.mode = normalizeDisplayMode(wx.getStorageSync(DISPLAY_MODE_STORAGE_KEY));
        this.listeners = new Set();
    }
    getState() {
        return { mode: this.mode };
    }
    setMode(mode) {
        if (mode === this.mode) {
            return;
        }
        this.mode = mode;
        wx.setStorageSync(DISPLAY_MODE_STORAGE_KEY, mode);
        this.listeners.forEach((listener) => listener(mode));
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.mode);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
export const displayModeStore = new DisplayModeStore();
