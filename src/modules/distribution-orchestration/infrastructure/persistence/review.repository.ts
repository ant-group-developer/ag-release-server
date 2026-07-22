import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
	ReviewRecord,
	ReviewRepository,
	ReviewStatus,
} from '../../application/ports/review-repository.port';
import { ReviewOrmEntity } from './review.orm-entity';

/**
 * TypeOrmReviewRepository — adapter cho ReviewRepository port.
 * Isolate application khỏi ORM entity — trả ReviewRecord DTO, không raw entity.
 */
@Injectable()
export class TypeOrmReviewRepository implements ReviewRepository {
	constructor(
		@InjectRepository(ReviewOrmEntity)
		private readonly repo: Repository<ReviewOrmEntity>,
	) {}

	async create(distributionId: string): Promise<string> {
		const entity = this.repo.create({
			distributionId,
			status: 'pending',
			reviewerId: null,
			note: null,
			decidedAt: null,
		});
		const saved = await this.repo.save(entity);
		return saved.id;
	}

	async decide(input: {
		id: string;
		reviewerId: string;
		status: Exclude<ReviewStatus, 'pending'>;
		note?: string;
	}): Promise<void> {
		await this.repo.update(
			{ id: input.id },
			{
				reviewerId: input.reviewerId,
				status: input.status,
				note: input.note ?? null,
				decidedAt: new Date(),
			},
		);
	}

	async findByDistribution(distributionId: string): Promise<ReviewRecord[]> {
		const rows = await this.repo.find({
			where: { distributionId },
			order: { createdAt: 'DESC' },
		});
		return rows.map((r) => ({
			id: r.id,
			distributionId: r.distributionId,
			reviewerId: r.reviewerId,
			status: r.status,
			note: r.note,
			decidedAt: r.decidedAt,
			createdAt: r.createdAt,
		}));
	}
}
