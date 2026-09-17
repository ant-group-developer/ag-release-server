import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
	Unique,
} from 'typeorm';
import { DistributionV2ExternalOperationStatus } from '../enums/distribution-v2.enum';

@Entity({ name: 'external_operations', schema: 'distribution_v2' })
@Unique('UQ_distribution_v2_external_operation_key', ['idempotencyKey'])
@Index('IDX_distribution_v2_external_provider_type', ['provider', 'operationType'])
export class ExternalOperationV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 40 })
	provider!: string;

	@Column({ name: 'operation_type', type: 'varchar', length: 60 })
	operationType!: string;

	@Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
	idempotencyKey!: string;

	@Column({ name: 'request_payload', type: 'jsonb', default: () => "'{}'::jsonb" })
	requestPayload!: Record<string, unknown>;

	@Column({ name: 'response_payload', type: 'jsonb', nullable: true })
	responsePayload!: Record<string, unknown> | null;

	@Column({ name: 'external_id', type: 'varchar', length: 180, nullable: true })
	externalId!: string | null;

	@Column({ type: 'varchar', length: 20 })
	status!: DistributionV2ExternalOperationStatus;

	@Column({ type: 'int', default: 0 })
	attempts!: number;

	@Column({ name: 'last_error', type: 'text', nullable: true })
	lastError!: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}

