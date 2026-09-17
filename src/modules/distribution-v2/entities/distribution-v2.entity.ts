import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import {
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../enums/distribution-v2.enum';

@Entity({ name: 'distributions', schema: 'distribution_v2' })
@Index('IDX_distribution_v2_release_id', ['releaseId'])
@Index('IDX_distribution_v2_status', ['status'])
@Index('IDX_distribution_v2_correlation_id', ['correlationId'])
export class DistributionV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId!: string;

	@Column({ type: 'varchar', length: 30 })
	type!: DistributionV2ExecutionType;

	@Column({ type: 'varchar', length: 40 })
	status!: DistributionV2Status;

	@Column({ name: 'snapshot_id', type: 'uuid' })
	snapshotId!: string;

	@Column({ name: 'correlation_id', type: 'uuid' })
	correlationId!: string;

	@Column({ name: 'created_by', type: 'uuid', nullable: true })
	createdBy!: string | null;

	@Column({ type: 'int', default: 0 })
	version!: number;

	@Column({
		name: 'last_command_id',
		type: 'varchar',
		length: 180,
		nullable: true,
	})
	lastCommandId!: string | null;

	@Column({ name: 'resubmitted_from_id', type: 'uuid', nullable: true })
	resubmittedFromId!: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}
