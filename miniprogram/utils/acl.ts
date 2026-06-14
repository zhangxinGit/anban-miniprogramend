import { USER_ROLES, type UserRole } from '../shared/roles';
import { ACL, type AclJson } from '../config/acl';

export type FeatureKey = string;

function normalizeRole(role: UserRole): keyof typeof ACL.matrix {
  return (ACL.matrix[role] ? role : USER_ROLES.VISITOR) as keyof typeof ACL.matrix;
}

function matchFeature(pattern: string, key: FeatureKey): boolean {
  if (pattern === '*') return true;
  if (pattern === key) return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return key.startsWith(prefix);
  }
  return false;
}

/**
 * 核心权限判断：
 * - 页面级：featureKey = "page.xxx"
 * - 按钮级：featureKey = "btn.xxx"
 * - 字段级：featureKey = "field.xxx"
 *
 * 无权限处理：外层用 wx:if 不渲染
 */
export function canAccess(role: UserRole, featureKey: FeatureKey): boolean {
  const r = normalizeRole(role);
  const allow = ACL.matrix[r]?.allow || [];
  return allow.some((p) => matchFeature(p, featureKey));
}

export function getAclVersion(): number {
  return ACL.version;
}

export function getFeatureLabel(featureKey: FeatureKey): string | undefined {
  const features = ACL.features as Partial<Record<FeatureKey, string>>;
  return features[featureKey];
}

