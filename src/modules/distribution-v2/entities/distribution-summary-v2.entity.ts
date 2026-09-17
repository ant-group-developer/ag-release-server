import {
	Column,
	CreateDateColumn,
	Entity,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';
import { DistributionV2Status } from '../enums/distribution-v2.enum';

@Entity({ name: 'distribution_summary', schema: 'distribution_v2' })
export class DistributionSummaryV2 {
	@PrimaryColumn({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ type: 'varchar', length: 40 })
	status!: DistributionV2Status;

	@Column({ name: 'total_channels', type: 'int', default: 0 })
	totalChannels!: number;

	@Column({ name: 'live_channels', type: 'int', default: 0 })
	liveChannels!: number;

	@Column({ name: 'waiting_channels', type: 'int', default: 0 })
	waitingChannels!: number;

	@Column({ name: 'issue_channels', type: 'int', default: 0 })
	issueChannels!: number;

	@Column({ name: 'current_step', type: 'varchar', length: 60, nullable: true })
	currentStep!: string | null;

	@Column({ name: 'latest_error', type: 'jsonb', nullable: true })
	latestError!: Record<string, unknown> | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}
