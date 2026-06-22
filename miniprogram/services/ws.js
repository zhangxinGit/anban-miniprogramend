let status = 'DISCONNECTED';
let socketTask = null;
const listeners = new Set();
export function getWsStatus() {
    return status;
}
/**
 * WebSocket 预留：
 * - 接入后端后，将消息写入 messageCenter 的存储即可驱动 UI/未读数
 */
export function connectWs(url) {
    if (!url)
        return;
    if (status === 'CONNECTING' || status === 'CONNECTED')
        return;
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
                const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                listeners.forEach((l) => l(data));
            }
            catch {
                // ignore
            }
        });
    }
    catch {
        status = 'DISCONNECTED';
        socketTask = null;
    }
}
export function disconnectWs() {
    var _a;
    try {
        (_a = socketTask === null || socketTask === void 0 ? void 0 : socketTask.close) === null || _a === void 0 ? void 0 : _a.call(socketTask, {});
    }
    catch {
        // ignore
    }
    status = 'DISCONNECTED';
    socketTask = null;
}
export function onWsMessage(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
