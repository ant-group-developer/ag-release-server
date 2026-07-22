/**
 * ReviewRepository port — lưu quyết định duyệt (audit).
 *
 * Application chỉ biết port này; adapter (infrastructure) bọc TypeORM repo.
 * Review row là AUDIT, tách khỏi ticket (điểm hỏng cho user sửa).
 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewRecord {
	readonly id: string;
	readonly distributionId: string;
	readonly reviewerId: string | null;
	readonly status: ReviewStatus;
	readonly note: string | null;
	readonly decidedAt: Date | null;
	readonly createdAt: Date;
}

export interface ReviewRepository {
	/** Tạo review row (pending). Trả review id. */
	create(distributionId: string): Promise<string>;

	/** Ghi quyết định (approved | rejected) + reviewerId + note + decidedAt. */
	decide(input: {
		id: string;
		reviewerId: string;
		status: Exclude<ReviewStatus, 'pending'>;
		note?: string;
	}): Promise<void>;

	/** Lịch sử review của 1 distribution (mới nhất trước). */
	findByDistribution(distributionId: string): Promise<ReviewRecord[]>;
}

// DI token
export const REVIEW_REPOSITORY = Symbol('ReviewRepository');
