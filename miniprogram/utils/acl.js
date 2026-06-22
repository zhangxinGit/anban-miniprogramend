import { USER_ROLES } from '../shared/roles';
import { ACL } from '../config/acl';
function normalizeRole(role) {
    return (ACL.matrix[role] ? role : USER_ROLES.VISITOR);
}
function matchFeature(pattern, key) {
    if (pattern === '*')
        return true;
    if (pattern === key)
        return true;
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
export function canAccess(role, featureKey) {
    var _a;
    const r = normalizeRole(role);
    const allow = ((_a = ACL.matrix[r]) === null || _a === void 0 ? void 0 : _a.allow) || [];
    return allow.some((p) => matchFeature(p, featureKey));
}
export function getAclVersion() {
    return ACL.version;
}
export function getFeatureLabel(featureKey) {
    const features = ACL.features;
    return features[featureKey];
}
