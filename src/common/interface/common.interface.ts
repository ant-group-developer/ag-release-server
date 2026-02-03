import { TenantType } from 'src/modules/tenant/tenant.enum';
import { TenantUserType, UserType } from 'src/modules/user/enum/user.enum';

export interface IAuditDto {
	creatorId: string;
	modifierId: string;
}

export interface UserReq {
	sub: string;
	id: string;
	email: string;
	name: string;

	isActive: boolean;
	type: UserType;

	tenantId: string;
	tenantType: TenantType;
	tenantUserType: TenantUserType;

	permission: string[];
}
