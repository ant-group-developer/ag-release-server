import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import {
	DistributionV2ChannelRoute,
	DistributionV2ChannelStatus,
	DistributionV2WaitReason,
} from '../enums/distribution-v2.enum';

@Entity({ name: 'channel_deliveries', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_channel_distribution_id', ['distributionId'])
@Index('IDX_distribution_v2_channel_waiting', ['status', 'scheduledAt'])
export class ChannelDeliveryV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'dsp_id', type: 'varchar', length: 10, nullable: true })
	dspId!: string | null;

	@Column({ name: 'dsp_code', type: 'varchar', length: 50 })
	dspCode!: string;

	@Column({ type: 'varchar', length: 20 })
	route!: DistributionV2ChannelRoute;

	@Column({
		name: 'aggregator_code',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	aggregatorCode!: string | null;

	@Column({ type: 'varchar', length: 40 })
	status!: DistributionV2ChannelStatus;

	@Column({
		name: 'current_stage',
		type: 'varchar',
		length: 60,
		nullable: true,
	})
	currentStage!: string | null;

	@Column({ name: 'retry_count', type: 'int', default: 0 })
	retryCount!: number;

	@Column({ name: 'previous_live', type: 'boolean', default: false })
	previousLive!: boolean;

	@Column({
		name: 'wait_reason',
		type: 'varchar',
		length: 30,
		nullable: true,
	})
	waitReason!: DistributionV2WaitReason | null;

	@Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
	scheduledAt!: Date | null;

	@Column({ name: 'last_error', type: 'jsonb', nullable: true })
	lastError!: Record<string, unknown> | null;

	@Column({
		name: 'external_refs',
		type: 'jsonb',
		default: () => "'{}'::jsonb",
	})
	externalRefs!: Record<string, unknown>;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}
