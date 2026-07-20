import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';

/**
 * ORM entity map bảng "orchestration_ticket".
 * Orchestration's OWN ticket store — NOT reusing v3 issue/release_errors.
 *
 * Mỗi ticket chứa structured metadata (jsonb) dùng chuẩn `items[]` + `context`
 * để client render mọi loại lỗi (QA flags, import warnings...) bằng 1 component.
 *
 * Idempotency: UNIQUE(idempotency_key) — mở lại cùng key trả ticket đã có.
 */
@Entity('orchestration_ticket')
@Unique('UQ_orch_ticket_idempotency_key', ['idempotencyKey'])
@Index('IDX_orch_ticket_dist_status', ['distributionId', 'status'])
export class OrchestrationTicketOrmEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	distributionId!: string;

	@Column({ type: 'varchar', length: 80, nullable: true })
	channelId!: string | null;

	/** TicketReason enum value (VALIDATION, QA_FLAG, INGEST_FAIL, ...) */
	@Column({ type: 'varchar', length: 30 })
	reason!: string;

	/** Human-readable summary — for logs/notification. */
	@Column({ type: 'text' })
	detail!: string;

	/**
	 * Structured error data — standardized `{items: TicketIssueItem[], context?}`.
	 * Client renders `items[]` directly without switching on `reason`.
	 * NULL when ticket has no structured data (e.g., simple text-only tickets).
	 */
	@Column({ type: 'jsonb', nullable: true })
	metadata!: object | null;

	/** Ticket lifecycle: 'open' → 'resolved'. */
	@Column({ type: 'varchar', length: 20, default: 'open' })
	status!: string;

	/** Idempotency key — prevents duplicate tickets from retried operations. */
	@Column({ type: 'varchar', length: 200 })
	idempotencyKey!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	/** Set when ticket is resolved. NULL while open. */
	@Column({ type: 'timestamptz', nullable: true })
	resolvedAt!: Date | null;
}
