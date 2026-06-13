import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, SecretOrKeyProvider, Strategy } from 'passport-jwt';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AccessControlService } from '../access-control/access-control.service';
import { AuthMessages } from '../auth/constants/messages';
import { UserService } from '../user/services/user.service';
import { JwtPayload } from './token.interface';

export type PublicKeysMap = Record<string, string>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly userService: UserService,
		private readonly accessControlService: AccessControlService,
		private readonly cfg: ConfigService,
		@Inject('PUBLIC_KEYS') publicKeys: PublicKeysMap,
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
				return done(null, key);
			} catch (e) {
				// JWT header parse error (e.g., token is literal string "undefined")
				return done(null, ''); // Trigger 401 Unauthorized instead of 500
			}
		};

		super({
			jwtFromRequest: ExtractJwt.fromExtractors([
				ExtractJwt.fromAuthHeaderAsBearerToken(),
				ExtractJwt.fromUrlQueryParameter('token'),
			]),
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

		// Single unified call — handles user/tenant validation,
		// permission resolution, and Redis caching
		const authContext = await this.accessControlService.getAuthContext(
			userId,
			tenantId,
		);

		this.userService.updateLastActive(authContext.userId);

		// Merge JWT claims with resolved auth context
		return {
			...claims,
			id: authContext.userId,
			email: authContext.email,
			name: authContext.name,
			avatar: authContext.avatar,
			type: authContext.userType,
			isActive: true, // Already validated by getAuthContext
			permission: authContext.permissions,
			tenantType: authContext.tenantType,
			tenantUserType: authContext.tenantUserType,
		};
	}
}
