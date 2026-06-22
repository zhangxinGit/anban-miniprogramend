export const USER_ROLES = {
    VISITOR: 'VISITOR',
    LEAD: 'LEAD',
    DEAL_NO_DEVICE: 'DEAL_NO_DEVICE',
    FAMILY_MEMBER: 'FAMILY_MEMBER',
    DEVICE_ADMIN: 'DEVICE_ADMIN',
    OWNER: 'OWNER',
};
export const ROLE_ORDER = [
    USER_ROLES.VISITOR,
    USER_ROLES.LEAD,
    USER_ROLES.DEAL_NO_DEVICE,
    USER_ROLES.FAMILY_MEMBER,
    USER_ROLES.DEVICE_ADMIN,
    USER_ROLES.OWNER,
];
export function isUserRole(role) {
    return (typeof role === 'string' &&
        ROLE_ORDER.includes(role));
}
