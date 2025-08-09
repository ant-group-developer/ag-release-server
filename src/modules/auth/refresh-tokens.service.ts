import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TokenService } from '../token/token.service';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokensService {
	constructor(
		@InjectRepository(RefreshToken)
		private readonly repo: Repository<RefreshToken>,
		private readonly tokens: TokenService,
	) {}

	async persist(
		userId: string,
		jti: string,
		rawToken: string,
		expiresAt?: Date | null,
	) {
		const entity = this.repo.create({
			userId,
			jti,
			hashedToken: this.tokens.hash(rawToken),
			revokedAt: null,
			replacedBy: null,
			expiresAt: expiresAt ?? null,
		});
		await this.repo.save(entity);
		return entity;
	}

	async revokeByJti(jti: string, replacedBy?: string | null) {
		await this.repo.update(
			{ jti },
			{ revokedAt: new Date(), replacedBy: replacedBy ?? null },
		);
	}

	async findActiveByJti(jti: string) {
		return this.repo.findOne({ where: { jti, revokedAt: IsNull() } });
	}

	// Optional: token reuse detection — revoke all tokens of the user
	async revokeAllForUser(userId: string) {
		await this.repo
			.createQueryBuilder()
			.update(RefreshToken)
			.set({ revokedAt: () => 'NOW()' })
			.where('"userId" = :userId AND "revokedAt" IS NULL', { userId })
			.execute();
	}

	isSameToken(record: RefreshToken, rawToken: string) {
		return record.hashedToken === this.tokens.hash(rawToken);
	}
}
