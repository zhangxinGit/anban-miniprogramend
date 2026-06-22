export function getEnvVersion() {
    var _a, _b;
    try {
        const info = (_a = wx.getAccountInfoSync) === null || _a === void 0 ? void 0 : _a.call(wx);
        const envVersion = (_b = info === null || info === void 0 ? void 0 : info.miniProgram) === null || _b === void 0 ? void 0 : _b.envVersion;
        return envVersion === 'develop' || envVersion === 'trial' || envVersion === 'release'
            ? envVersion
            : 'release';
    }
    catch {
        return 'release';
    }
}
export function isDevelopEnv() {
    return getEnvVersion() === 'develop';
}
