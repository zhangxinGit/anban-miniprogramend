export function getErrorMessage(error, fallback) {
    if (error instanceof Error) {
        const msg = error.message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
            return msg;
        }
    }
    if (error !== null && typeof error === 'object') {
        const obj = error;
        const keys = ['message', 'errMsg', 'msg', 'error', 'errmsg'];
        for (let i = 0; i < keys.length; i++) {
            const val = obj[keys[i]];
            if (typeof val === 'string' && val.trim().length > 0) {
                return val;
            }
        }
    }
    return fallback;
}
