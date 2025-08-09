import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, SecretOrKeyProvider, Strategy } from 'passport-jwt';
import { UserService } from '../user/services/user.service';
import { JwtPayload } from './token.interface';

export type PublicKeysMap = Record<string, string>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
	constructor(
		private readonly userService: UserService,
		private readonly cfg: ConfigService,
		@Inject('PUBLIC_KEYS') publicKeys: PublicKeysMap, // capture as local
	) {
		const keyProvider: SecretOrKeyProvider = (
			_req: Request,
			rawJwt: string,
			done: (err: any, secretOrPublicKey?: string | Buffer) => void,
		) => {
			try {
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
					return done(new Error(`Unknown key id: ${kid}`));
				}
				// console.log('Using kid:', kid); // uncomment for debugging
				return done(null, key);
			} catch (e) {
				console.error('JWT header parse error:', e);
				return done(e);
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
			throw new UnauthorizedException('Wrong token type');
		}

		const user = await this.userService.findOne(claims.sub, {
			select: ['type', 'isActive', 'email', 'name'],
		});
		if (!user) throw new UnauthorizedException('User not found');

		if (!user.isActive) {
			throw new UnauthorizedException('User disabled');
		}

		// merge claims + safe DB fields
		return {
			...claims, // sub, permissions, tenantId, jti
			...user, // id/email/name/avatar/status
		};
	}
}
