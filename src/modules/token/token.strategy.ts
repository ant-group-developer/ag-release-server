import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, SecretOrKeyProvider, Strategy } from 'passport-jwt';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AuthMessages } from '../auth/constants/messages';
import { TenantType } from '../tenant/tenant.enum';
import { TenantService } from '../tenant/tenant.service';
import { UserRoleService } from '../user-role/user-role.service';
import { TenantUserType } from '../user/enum/user.enum';
import { UserTypeService } from '../user/services/user-type.service';
import { UserService } from '../user/services/user.service';
import {
	checkIsNotSystemTenant,
	checkIsSystemAdmin,
	checkIsSystemTenant,
} from '../user/utils/user-type.util';
import { JwtPayload } from './token.interface';

export type PublicKeysMap = Record<string, string>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly userService: UserService,
		private readonly userRoleService: UserRoleService,
		private readonly userTypeService: UserTypeService,
		private readonly tenantService: TenantService,
		private readonly cfg: ConfigService,
		@Inject('PUBLIC_KEYS') publicKeys: PublicKeysMap, // capture as local
	) {
		const keyProvider: SecretOrKeyProvider = (
			_req: Request,
			rawJwt: string,
			done: (err: any, secretOrPublicKey?: string | Buffer) => void,
		) => {
			try {
				if (!rawJwt || !rawJwt.includes('.')) {
					return done(null, ''); // Invalid token format, trigger 401
				}
				
				const header = JSON.parse(
					Buffer.from(rawJwt.split('.')[0], 'base64url').toString(
						'utf8',
					),
				);
				const kid = header.kid || cfg.get<string>('JWT_KID') || 'v1';
				const key = publicKeys[kid];
				if (!key) {
					console.error(
						'JWT key lookup failed. header.kid =',
						header.kid,
						'fallback kid =',
						kid,
					);
					return done(new Error(`Unknown key id: ${kid}`)); // Internal error configuration
				}
				// console.log('Using kid:', kid); // uncomment for debugging
				return done(null, key);
			} catch (e) {
				// JWT header parse error (e.g., token is literal string "undefined")
				return done(null, ''); // Trigger 401 Unauthorized instead of 500
			}
		};

		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			secretOrKeyProvider: keyProvider,
			issuer: cfg.get<string>('JWT_ISSUER'),
			audience: cfg.get<string>('JWT_AUDIENCE'),
			algorithms: ['RS256'],
			ignoreExpiration: false,
		});
	}

	async validate(claims: JwtPayload) {
		if (claims.tokenType && claims.tokenType !== 'access') {
			throw new ResponseError(AuthMessages.INVALID_TOKEN_TYPE);
		}

		const { tenantId, sub: userId } = claims;

		if (checkIsNotSystemTenant(tenantId)) {
			const tenant = await this.tenantService.getOneTenantData(tenantId, {
				select: ['isActive'],
			});
			this.tenantService.checkActive(tenant.isActive);
		}

		const user = await this.userService.findOne(userId, {
			select: ['id', 'type', 'isActive', 'email', 'name', 'avatar'],
		});
		this.userService.checkActive(user.isActive);

		const permission = await this.userRoleService.getPermission(
			tenantId,
			user.id,
		);

		let tenantUserType = TenantUserType.OWNER;
		let tenantType;
		if (checkIsSystemAdmin(user.type)) {
			if (checkIsSystemTenant(tenantId)) {
				tenantType = TenantType.WHITE_LABEL;
			} else {
				tenantType = await this.tenantService.getTenantType(tenantId);
			}
		} else {
			const data =
				await this.userTypeService.getTenantTypeAndTenantUserType(
					tenantId,
					user.id,
				);
			tenantUserType = data.tenantUserType;
			tenantType = data.tenantType;
		}

		this.userService.updateLastActive(user.id);

		// merge claims + safe DB fields
		return {
			...claims, // sub, permissions, tenantId, jti
			...user, // id/email/name/avatar/status
			permission: permission.map((item) => item.code),
			tenantType,
			tenantUserType,
		};
	}
}
