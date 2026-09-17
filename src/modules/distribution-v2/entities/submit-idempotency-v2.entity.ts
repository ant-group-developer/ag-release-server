import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
} from 'typeorm';

@Entity({ name: 'submit_idempotencies', schema: 'distribution_v2' })
@Unique('UQ_distribution_v2_submit_idempotency', [
	'tenantId',
	'operation',
	'idempotencyKey',
])
@Index('IDX_distribution_v2_submit_idempotency_release', ['releaseId'])
export class SubmitIdempotencyV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ type: 'varchar', length: 30 })
	operation!: string;

	@Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
	idempotencyKey!: string;

	@Column({ name: 'request_hash', type: 'varchar', length: 128 })
	requestHash!: string;

	@Column({ name: 'distribution_id', type: 'uuid', nullable: true })
	distributionId!: string | null;

	@Column({ name: 'correlation_id', type: 'uuid', nullable: true })
	correlationId!: string | null;

	@Column({ name: 'response_payload', type: 'jsonb', nullable: true })
	responsePayload!: Record<string, unknown> | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;
}
