import { ROLE_ORDER, type UserRole, USER_ROLES } from '../shared/roles';
import { canAccess } from './acl';

export type AccessRule =
  | { anyOf: readonly UserRole[] }
  | { minRole: UserRole };

function roleRank(role: UserRole): number {
  const idx = ROLE_ORDER.indexOf(role);
  return idx === -1 ? 0 : idx;
}

export function hasAccess(role: UserRole, rule: AccessRule): boolean {
  if ('anyOf' in rule) return rule.anyOf.includes(role);
  return roleRank(role) >= roleRank(rule.minRole);
}

export function isDealed(role: UserRole): boolean {
  return role === USER_ROLES.CUSTOMER
    || role === USER_ROLES.OPERATOR
    || role === USER_ROLES.ADMIN;
}

export function tabCountByRole(role: UserRole): 2 | 3 | 4 {
  void role;
  return 3;
}

/**
 * 给页面 data 用：无权限 = 不渲染（wx:if="{{visible.xxx}}"）
 */
export function buildVisibilityMap<T extends Record<string, AccessRule>>(
  role: UserRole,
  rules: T,
): Record<keyof T, boolean> {
  const out = {} as Record<keyof T, boolean>;
  (Object.keys(rules) as (keyof T)[]).forEach((k) => {
    out[k] = hasAccess(role, rules[k]);
  });
  return out;
}

