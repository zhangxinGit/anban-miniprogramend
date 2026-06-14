export type WsStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export type WsMessage =
  | { type: 'SYSTEM_NOTICE'; payload: any }
  | { type: 'DEVICE_ALARM'; payload: any }
  | { type: 'PING'; payload?: any };

let status: WsStatus = 'DISCONNECTED';
let socketTask: WechatMiniprogram.SocketTask | null = null;
const listeners = new Set<(msg: WsMessage) => void>();

export function getWsStatus(): WsStatus {
  return status;
}

/**
 * WebSocket 预留：
 * - 接入后端后，将消息写入 messageCenter 的存储即可驱动 UI/未读数
 */
export function connectWs(url: string) {
  if (!url) return;
  if (status === 'CONNECTING' || status === 'CONNECTED') return;
  status = 'CONNECTING';
  try {
    socketTask = wx.connectSocket({ url });
    socketTask.onOpen(() => {
      status = 'CONNECTED';
    });
    socketTask.onClose(() => {
      status = 'DISCONNECTED';
      socketTask = null;
    });
    socketTask.onError(() => {
      status = 'DISCONNECTED';
      socketTask = null;
    });
    socketTask.onMessage((res) => {
      try {
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as any);
        listeners.forEach((l) => l(data as WsMessage));
      } catch {
        // ignore
      }
    });
  } catch {
    status = 'DISCONNECTED';
    socketTask = null;
  }
}

export function disconnectWs() {
  try {
    socketTask?.close?.({});
  } catch {
    // ignore
  }
  status = 'DISCONNECTED';
  socketTask = null;
}

export function onWsMessage(listener: (msg: WsMessage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

