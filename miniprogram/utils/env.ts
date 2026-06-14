export type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

export function getEnvVersion(): MiniProgramEnvVersion {
  try {
    const info = wx.getAccountInfoSync?.();
    const envVersion = info?.miniProgram?.envVersion;
    return envVersion === 'develop' || envVersion === 'trial' || envVersion === 'release'
      ? envVersion
      : 'release';
  } catch {
    return 'release';
  }
}

export function isDevelopEnv(): boolean {
  return getEnvVersion() === 'develop';
}

