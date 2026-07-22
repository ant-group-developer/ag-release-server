import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * ORM entity map bảng "distribution_review".
 *
 * Audit quyết định duyệt của reviewer/admin. KHÁC orchestration_ticket:
 *   · review row = lịch sử "ai duyệt / khi nào / note" (pending → approved | rejected)
 *   · ticket     = điểm hỏng để user sửa (REVIEW_REJECT → ACTION_REQUIRED)
 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

@Entity('distribution_review')
@Index('IDX_dist_review_distribution_id', ['distributionId'])
export class ReviewOrmEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid', name: 'distribution_id' })
	distributionId!: string;

	/** User đã ra quyết định. NULL khi mới tạo (pending). */
	@Column({ type: 'uuid', name: 'reviewer_id', nullable: true })
	reviewerId!: string | null;

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: ReviewStatus;

	/** Lý do reject (reviewer nhập). NULL cho approve. */
	@Column({ type: 'text', nullable: true })
	note!: string | null;

	/** Set khi decide(). NULL khi còn pending. */
	@Column({ type: 'timestamptz', name: 'decided_at', nullable: true })
	decidedAt!: Date | null;

	@CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
	createdAt!: Date;
}
