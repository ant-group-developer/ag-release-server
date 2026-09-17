import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';

@Entity({ name: 'export_batch_members', schema: 'distribution_v2' })
@Unique('UQ_distribution_v2_export_batch_member', ['batchId', 'channelId'])
@Index('IDX_distribution_v2_batch_member_distribution_id', ['distributionId'])
@Index('IDX_distribution_v2_batch_member_release_id', ['releaseId'])
export class ExportBatchMemberV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'batch_id', type: 'uuid' })
	batchId!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'channel_id', type: 'uuid' })
	channelId!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	upc!: string | null;

	@Column({ name: 'dsp_code', type: 'varchar', length: 50 })
	dspCode!: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}

