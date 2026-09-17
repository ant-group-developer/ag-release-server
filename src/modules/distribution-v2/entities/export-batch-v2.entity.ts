import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import {
	DistributionV2BatchStatus,
	DistributionV2BatchType,
} from '../enums/distribution-v2.enum';

@Entity({ name: 'export_batches', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_export_batch_lookup', [
	'tenantId',
	'aggregatorCode',
	'type',
	'businessDate',
])
export class ExportBatchV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId!: string;

	@Column({ name: 'aggregator_code', type: 'varchar', length: 30 })
	aggregatorCode!: string;

	@Column({ type: 'varchar', length: 30 })
	type!: DistributionV2BatchType;

	@Column({ name: 'business_date', type: 'date' })
	businessDate!: string;

	@Column({ name: 'cutoff_at', type: 'timestamptz' })
	cutoffAt!: Date;

	@Column({ type: 'varchar', length: 30 })
	status!: DistributionV2BatchStatus;

	@Column({ name: 'artifact_path', type: 'text', nullable: true })
	artifactPath!: string | null;

	@Column({ name: 'external_job_id', type: 'varchar', length: 180, nullable: true })
	externalJobId!: string | null;

	@Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
	sentAt!: Date | null;

	@Column({ name: 'last_error', type: 'text', nullable: true })
	lastError!: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}

