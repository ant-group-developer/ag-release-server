import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'distribution_events', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_event_distribution_id_id', ['distributionId', 'id'])
@Index('IDX_distribution_v2_event_type', ['eventType'])
export class DistributionEventV2 {
	@PrimaryGeneratedColumn({ type: 'bigint' })
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'channel_id', type: 'uuid', nullable: true })
	channelId!: string | null;

	@Column({ name: 'step_id', type: 'uuid', nullable: true })
	stepId!: string | null;

	@Column({ name: 'event_type', type: 'varchar', length: 80 })
	eventType!: string;

	@Column({ type: 'varchar', length: 20, default: 'milestone' })
	level!: string;

	@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
	payload!: Record<string, unknown>;

	@Column({ name: 'correlation_id', type: 'uuid' })
	correlationId!: string;

	@Column({ name: 'occurred_at', type: 'timestamptz' })
	occurredAt!: Date;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}

