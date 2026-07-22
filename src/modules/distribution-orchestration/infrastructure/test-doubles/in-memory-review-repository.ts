import {
	ReviewRecord,
	ReviewRepository,
	ReviewStatus,
} from '../../application/ports/review-repository.port';

/**
 * InMemoryReviewRepository — test double cho ReviewRepository.
 * Lưu review row trong RAM; test đọc `records` để assert audit.
 */
export class InMemoryReviewRepository implements ReviewRepository {
	readonly records: Array<{
		id: string;
		distributionId: string;
		reviewerId: string | null;
		status: ReviewStatus;
		note: string | null;
		decidedAt: Date | null;
		createdAt: Date;
	}> = [];
	private seq = 0;

	async create(distributionId: string): Promise<string> {
		const id = `review-${++this.seq}`;
		this.records.push({
			id,
			distributionId,
			reviewerId: null,
			status: 'pending',
			note: null,
			decidedAt: null,
			createdAt: new Date(),
		});
		return id;
	}

	async decide(input: {
		id: string;
		reviewerId: string;
		status: Exclude<ReviewStatus, 'pending'>;
		note?: string;
	}): Promise<void> {
		const row = this.records.find((r) => r.id === input.id);
		if (!row) return;
		row.reviewerId = input.reviewerId;
		row.status = input.status;
		row.note = input.note ?? null;
		row.decidedAt = new Date();
	}

	async findByDistribution(distributionId: string): Promise<ReviewRecord[]> {
		return this.records
			.filter((r) => r.distributionId === distributionId)
			.reverse();
	}
}
