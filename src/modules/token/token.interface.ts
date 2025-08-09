import { UserType } from '../user/enum/user.enum';

export interface JwtPayload {
	sub: string;
	tenantId?: string;
	tokenType?: 'access' | 'refresh';
	jti?: string;
	[k: string]: any;
}

export interface UserFromRequest extends JwtPayload {
	name: string;
	email: string;
	type: UserType;
	isActive: boolean;
}
