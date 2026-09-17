import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { DistributionV2IssueStatus } from '../enums/distribution-v2.enum';

@Entity({ name: 'issues', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_issue_distribution_id', ['distributionId'])
@Index('IDX_distribution_v2_issue_status', ['status'])
export class IssueV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'channel_id', type: 'uuid', nullable: true })
	channelId!: string | null;

	@Column({ name: 'step_id', type: 'uuid', nullable: true })
	stepId!: string | null;

	@Column({ type: 'varchar', length: 60 })
	code!: string;

	@Column({ type: 'varchar', length: 20 })
	severity!: string;

	@Column({ type: 'text' })
	message!: string;

	@Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
	rawPayload!: Record<string, unknown> | null;

	@Column({ type: 'varchar', length: 20, default: DistributionV2IssueStatus.OPEN })
	status!: DistributionV2IssueStatus;

	@Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
	resolvedAt!: Date | null;

	@Column({ name: 'resolved_by', type: 'uuid', nullable: true })
	resolvedBy!: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}

