import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'argon2';
import { Request } from 'express';
import { JwtPayload } from '../token/token.interface';
import { TokenService } from '../token/token.service';
import { UserService } from '../user/services/user.service';
import { SiginDto } from './auth.dto';
import { AuthMessages } from './auth.messages';
import { RefreshTokensService } from './refresh-tokens.service';

@Injectable()
export class AuthService {
	constructor(
		private readonly tokens: TokenService,
		private readonly refreshSvc: RefreshTokensService,
		private readonly cfg: ConfigService,
		private readonly userService: UserService,
	) {}

	me(req: Request) {
		return this.userService.findOne(req.user?.sub as string);
	}

	// Call after validating user credentials
	async login(body: SiginDto) {
		const user = await this.userService.findOneByEmail(body.email, {
			relations: {
				tenantUser: true,
			},
			select: {
				tenantUser: {
					id: true,
					type: true,
					tenantId: true,
				},
			},
		});
		if (!user.isActive)
			throw new UnauthorizedException(AuthMessages.USER_NOT_FOUND);

		const valid = await verify(user.password, body.password);
		if (!valid)
			throw new UnauthorizedException(AuthMessages.INVALID_CREDENTIALS);

		const payload = {
			sub: user.id,
			tenantId: user.tenantUser[0]?.tenantId,
		};

		const accessToken = await this.tokens.signAccessToken(payload);

		const { token: refreshToken, jti } =
			await this.tokens.signRefreshToken(payload);
		// Optionally compute expiry date for DB (decode exp claim)
		const decoded = this.tokens.decode<{ exp?: number }>(refreshToken);
		const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
		await this.refreshSvc.persist(user.id, jti, refreshToken, expiresAt);

		return { accessToken, refreshToken };
	}

	// Rotate refresh token
	async refresh(oldRefreshToken: string) {
		let payload: JwtPayload;
		try {
			payload = await this.tokens.verify<JwtPayload>(oldRefreshToken);
		} catch {
			throw new UnauthorizedException(
				AuthMessages.INVALID_OR_EXPIRED_TOKEN,
			);
		}

		if (payload.tokenType !== 'refresh' || !payload.jti || !payload.sub) {
			throw new UnauthorizedException(
				AuthMessages.INVALID_OR_EXPIRED_TOKEN,
			);
		}

		// Check DB record
		// const record = await this.refreshSvc.findActiveByJti(payload.jti);
		// if (!record) {
		// 	// Token reuse or already revoked -> lock down (optional)
		// 	throw new ForbiddenException(AuthMessages.TOKEN_REVOKED);
		// }
		// if (!this.refreshSvc.isSameToken(record, oldRefreshToken)) {
		// 	// Token hash mismatch -> possible tampering
		// 	await this.refreshSvc.revokeAllForUser(payload.sub);
		// 	throw new ForbiddenException(AuthMessages.REUSE_TOKEN);
		// }

		// Rotate: revoke old, issue new pair
		const base = {
			sub: payload.sub,
			tenantId: payload.tenantId,
		};
		const accessToken = await this.tokens.signAccessToken(base);
		// const { token: newRefreshToken, jti: newJti } =
		// 	await this.tokens.signRefreshToken(base);

		// await this.refreshSvc.revokeByJti(record.jti, newJti);
		// const decoded = this.tokens.decode<{ exp?: number }>(newRefreshToken);
		// const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : null;
		// await this.refreshSvc.persist(
		// 	payload.sub,
		// 	newJti,
		// 	newRefreshToken,
		// 	expiresAt,
		// );

		return { accessToken, refreshToken: oldRefreshToken };
	}

	async logout(refreshToken: string) {
		try {
			const payload = await this.tokens.verify<JwtPayload>(refreshToken);
			if (payload.tokenType === 'refresh' && payload.jti) {
				await this.refreshSvc.revokeByJti(payload.jti);
			}
		} catch {
			// ignore verification errors on logout to be idempotent
		}
		return { ok: true };
	}
}
