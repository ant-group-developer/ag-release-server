import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { DistributionV2StepStatus } from '../enums/distribution-v2.enum';

@Entity({ name: 'step_runs', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_step_distribution_id', ['distributionId'])
@Index('IDX_distribution_v2_step_channel_id', ['channelId'])
export class StepRunV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'channel_id', type: 'uuid', nullable: true })
	channelId!: string | null;

	@Column({ name: 'step_type', type: 'varchar', length: 60 })
	stepType!: string;

	@Column({ type: 'varchar', length: 30 })
	status!: DistributionV2StepStatus;

	@Column({ name: 'attempt_no', type: 'int', default: 1 })
	attemptNo!: number;

	@Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
	idempotencyKey!: string;

	@Column({ name: 'input', type: 'jsonb', default: () => "'{}'::jsonb" })
	input!: Record<string, unknown>;

	@Column({ name: 'output', type: 'jsonb', nullable: true })
	output!: Record<string, unknown> | null;

	@Column({ name: 'error', type: 'jsonb', nullable: true })
	error!: Record<string, unknown> | null;

	@Column({ name: 'started_at', type: 'timestamptz', nullable: true })
	startedAt!: Date | null;

	@Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
	completedAt!: Date | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}

