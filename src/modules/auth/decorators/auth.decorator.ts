import { SetMetadata } from '@nestjs/common';
import {
	AUTH_PERMISSIONS_KEY,
	AUTH_PUBLIC_KEY,
	AUTH_SYSTEM_ADMIN_ONLY_KEY,
	AUTH_TENANT_OWNER_ONLY_KEY,
	AUTH_TENANT_OWNER_OR_ADMIN_ONLY_KEY,
	AUTH_TENANT_WHITE_LABEL_ONLY_KEY,
	Permission,
} from '../constants/key';

export const RequirePermissions = (...perms: Permission[]) =>
	SetMetadata(AUTH_PERMISSIONS_KEY, perms);

/** Shortcut: only system admins can access */
export const SystemAdminOnly = () =>
	SetMetadata(AUTH_SYSTEM_ADMIN_ONLY_KEY, true);

/** Mark a route as publicly accessible (no auth required) */
export const PublicRoute = () => SetMetadata(AUTH_PUBLIC_KEY, true);

/** Only tenant owner can access */
export const TenantOwnerOnly = () =>
	SetMetadata(AUTH_TENANT_OWNER_ONLY_KEY, true);

/** Only tenant owner OR tenant admin can access */
export const TenantOwnerOrAdminOnly = () =>
	SetMetadata(AUTH_TENANT_OWNER_OR_ADMIN_ONLY_KEY, true);

/** Only tenant type white label can access */
export const TenantWhiteLabelOnly = () =>
	SetMetadata(AUTH_TENANT_WHITE_LABEL_ONLY_KEY, true);
