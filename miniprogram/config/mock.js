/**
 * 纯前端联调开关：
 * - true：不发起 `/api/**`，数据来自本地存储（仅开发/演示；**上线构建务必改为 false**）
 * - false：走真实后端（配置 `config/api.ts`、合法域名与鉴权）
 */
export const FORCE_MOCK = false;
