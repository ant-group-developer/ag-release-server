import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';

@Entity({ name: 'outbox_events', schema: 'distribution_v2' })
@Unique('UQ_distribution_v2_outbox_job_id', ['jobId'])
@Index('IDX_distribution_v2_outbox_pending', ['dispatchedAt', 'availableAt'])
export class OutboxEventV2 {
	@PrimaryGeneratedColumn({ type: 'bigint' })
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'queue_name', type: 'varchar', length: 100 })
	queueName!: string;

	@Column({ type: 'jsonb' })
	payload!: Record<string, unknown>;

	@Column({ name: 'job_id', type: 'varchar', length: 180 })
	jobId!: string;

	@Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
	availableAt!: Date;

	@Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
	leaseUntil!: Date | null;

	@Column({ type: 'int', default: 0 })
	attempts!: number;

	@Column({ name: 'last_error', type: 'text', nullable: true })
	lastError!: string | null;

	@Column({ name: 'last_attempted_at', type: 'timestamptz', nullable: true })
	lastAttemptedAt!: Date | null;

	@Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
	dispatchedAt!: Date | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}

