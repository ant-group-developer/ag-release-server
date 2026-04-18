import { TenantType } from '../tenant/tenant.enum';
import { TenantUserType, UserType } from '../user/enum/user.enum';

/**
 * The unified auth context resolved for each request.
 * This is the single source of truth for user identity and capabilities.
 */
export interface AuthContext {
	userId: string;
	tenantId: string;

	// User identity
	email: string;
	name: string;
	avatar: string | null;

	// Types
	userType: UserType;
	tenantType: TenantType;
	tenantUserType: TenantUserType;

	// Resolved permission codes
	permissions: string[];
}
