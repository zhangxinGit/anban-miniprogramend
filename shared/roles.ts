export const USER_ROLES = {
  VISITOR: 'VISITOR',
  LEAD: 'LEAD',
  DEAL_NO_DEVICE: 'DEAL_NO_DEVICE',
  FAMILY_MEMBER: 'FAMILY_MEMBER',
  DEVICE_ADMIN: 'DEVICE_ADMIN',
  OWNER: 'OWNER',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_ORDER: readonly UserRole[] = [
  USER_ROLES.VISITOR,
  USER_ROLES.LEAD,
  USER_ROLES.DEAL_NO_DEVICE,
  USER_ROLES.FAMILY_MEMBER,
  USER_ROLES.DEVICE_ADMIN,
  USER_ROLES.OWNER,
] as const;

export function isUserRole(role: unknown): role is UserRole {
  return (
    typeof role === 'string' &&
    (ROLE_ORDER as readonly string[]).includes(role)
  );
}

