import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { TenantType } from 'src/modules/tenant/tenant.enum';
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
	tenantUserType: TenantUserType,
): boolean => {
	const isSystemAdmin = checkIsSystemAdmin(systemType);
	const isTenantOwnerOrAdmin = checkIsTenantOwnerOrAdmin(tenantUserType);
	return isSystemAdmin || isTenantOwnerOrAdmin;
};

export const checkIsSystemTenant = (tenantId: string) =>
	tenantId === SYSTEM_TENANT_ID;

export const checkIsNotSystemTenant = (tenantId: string) =>
	tenantId !== SYSTEM_TENANT_ID;

export const checkTenantType = (type: TenantType) => {
	return {
		// isTypeLabel: type === TenantType.LABEL,
		isTypeWhiteLabel: type === TenantType.WHITE_LABEL,
	};
};
