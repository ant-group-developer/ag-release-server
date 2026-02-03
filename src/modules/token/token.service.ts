import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { JwtPayload } from './token.interface';

@Injectable()
export class TokenService {
	constructor(
		private readonly jwt: JwtService,
		private readonly cfg: ConfigService,
	) {}

	// helper: SHA-256 hash for DB storage
	hash(token: string) {
		return createHash('sha256').update(token).digest('hex');
	}

	async signAccessToken(payload: Omit<JwtPayload, 'tokenType' | 'jti'>) {
		return this.jwt.signAsync(
			{ ...payload, tokenType: 'access', jti: randomUUID() },
			{ keyid: this.cfg.get('JWT_KID') || 'v1' },
		);
	}

	async signRefreshToken(
		payload: Omit<JwtPayload, 'tokenType' | 'jti'> & { jti?: string },
	) {
		// Allow passing a fixed jti when rotating
		const jti = payload.jti ?? randomUUID();
		const token = await this.jwt.signAsync(
			{ ...payload, tokenType: 'refresh', jti },
			{
				keyid: this.cfg.get('JWT_KID') || 'v1',
				expiresIn: this.cfg.get('JWT_REFRESH_EXPIRES_IN') || '7d',
			},
		);
		return { token, jti };
	}

	async verify<T = JwtPayload>(token: string) {
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return this.jwt.verifyAsync<T>(token);
	}

	decode<T = any>(token: string) {
		return this.jwt.decode<T>(token, { json: true });
	}
}
