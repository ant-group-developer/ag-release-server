/** Domain permission token, e.g. 'project:read' */
export type Permission = string;

/* =========================
 * Metadata keys (namespaced)
 * ========================= */
export const AUTH_PUBLIC_KEY = 'auth:public';
export const AUTH_PERMISSIONS_KEY = 'auth:permissions';
export const AUTH_SYSTEM_ADMIN_ONLY_KEY = 'auth:system-admin-only';
export const AUTH_TENANT_OWNER_ONLY_KEY = 'auth:tenant-owner-only';
export const AUTH_TENANT_OWNER_OR_ADMIN_ONLY_KEY =
	'auth:tenant-owner-or-admin-only';
export const AUTH_TENANT_WHITE_LABEL_ONLY_KEY = 'auth:tenant-white-label-only';
