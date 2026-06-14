export type DisplayMode = 'standard' | 'aged';

type Listener = (mode: DisplayMode) => void;

const DISPLAY_MODE_STORAGE_KEY = 'ab_display_mode_v1';

function normalizeDisplayMode(value: unknown): DisplayMode {
  return value === 'standard' ? 'standard' : 'aged';
}

class DisplayModeStore {
  private mode: DisplayMode = normalizeDisplayMode(wx.getStorageSync(DISPLAY_MODE_STORAGE_KEY));
  private listeners = new Set<Listener>();

  getState(): { mode: DisplayMode } {
    return { mode: this.mode };
  }

  setMode(mode: DisplayMode) {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    wx.setStorageSync(DISPLAY_MODE_STORAGE_KEY, mode);
    this.listeners.forEach((listener) => listener(mode));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.mode);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const displayModeStore = new DisplayModeStore();