import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { TenantUserType, UserType } from '../enum/user.enum';

export const checkIsTenantAdmin = (type: TenantUserType): boolean => {
	return type === TenantUserType.ADMIN;
};

export const checkIsTenantOwner = (type: TenantUserType): boolean => {
	return type === TenantUserType.OWNER;
};

export const checkIsTenantOwnerOrAdmin = (type: TenantUserType): boolean => {
	const isTenantAdmin = checkIsTenantAdmin(type);
	const isTenantOwner = checkIsTenantOwner(type);
	return isTenantAdmin || isTenantOwner;
};

export const checkIsSystemAdmin = (type: UserType): boolean => {
	return type === UserType.ADMIN;
};

export const checkIsNotSystemAdmin = (type: UserType): boolean => {
	return type !== UserType.ADMIN;
};

export const checkCanAccessTenantAll = (
	systemType: UserType,
	tenantType: TenantUserType,
): boolean => {
	const isSystemAdmin = checkIsSystemAdmin(systemType);
	const isTenantOwnerOrAdmin = checkIsTenantOwnerOrAdmin(tenantType);
	return isSystemAdmin || isTenantOwnerOrAdmin;
};

export const checkIsSystemTenant = (tenantId: string) =>
	tenantId === SYSTEM_TENANT_ID;

export const checkIsNotSystemTenant = (tenantId: string) =>
	tenantId !== SYSTEM_TENANT_ID;
