import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';

/**
 * ORM entity map bảng "outbox_event" — "ý định enqueue" BullMQ.
 * Relay đọc WHERE dispatched_at IS NULL FOR UPDATE SKIP LOCKED → enqueue → mark.
 * UNIQUE(jobId) = lớp phòng thủ 0 chống trùng tầng DB.
 */
@Entity('outbox_event')
@Unique('UQ_outbox_event_job_id', ['jobId'])
// partial index (WHERE dispatched_at IS NULL) không khai qua decorator được;
// sẽ bổ sung bằng migration raw SQL sau khi generate.
@Index('IDX_outbox_event_pending', ['dispatchedAt', 'createdAt'])
export class OutboxEventOrmEntity {
	@PrimaryGeneratedColumn('increment', { type: 'bigint' })
	id!: string;

	@Column({ type: 'uuid' })
	distributionId!: string;

	@Column({ type: 'varchar', length: 40 })
	queue!: string;

	@Column({ type: 'jsonb' })
	payload!: object;

	/** Idempotency key = BullMQ jobId. UNIQUE constraint chặn trùng. */
	@Column({ type: 'varchar', length: 120 })
	jobId!: string;

	@Column({ type: 'int', default: 0 })
	delayMs!: number;

	/** schedule(at) mode. NULL khi enqueue(delayMs) — relay tự tính từ createdAt + delayMs. */
	@Column({ type: 'timestamptz', nullable: true })
	runAt!: Date | null;

	@Column({ type: 'int', default: 0 })
	attempts!: number;

	@Column({ type: 'text', nullable: true })
	lastError!: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	lastAttemptedAt!: Date | null;

	/** NULL = chưa enqueue; relay set khi thành công. */
	@Column({ type: 'timestamptz', nullable: true })
	dispatchedAt!: Date | null;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
