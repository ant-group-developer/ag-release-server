import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from 'typeorm';
import { DistributionV2IdentifierKind } from '../application/ports/identifier-provisioner.port';

@Entity({ name: 'identifier_assignments', schema: 'distribution_v2' })
@Unique('UQ_distribution_v2_identifier_assignment_request', [
	'kind',
	'requestId',
])
@Index('IDX_distribution_v2_identifier_assignment_distribution', [
	'distributionId',
])
@Index('IDX_distribution_v2_identifier_assignment_owner', [
	'kind',
	'releaseId',
	'trackId',
])
export class IdentifierAssignmentV2 {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'distribution_id', type: 'uuid' })
	distributionId!: string;

	@Column({ name: 'release_id', type: 'uuid' })
	releaseId!: string;

	@Column({ name: 'track_id', type: 'varchar', length: 64, nullable: true })
	trackId!: string | null;

	@Column({ type: 'varchar', length: 10 })
	kind!: DistributionV2IdentifierKind;

	@Column({ type: 'varchar', length: 30 })
	source!: 'release.upc' | 'track.isrc' | 'video.isrc';

	@Column({ type: 'varchar', length: 20 })
	value!: string;

	@Column({ name: 'request_id', type: 'varchar', length: 180 })
	requestId!: string;

	@Column({ name: 'idempotency_key', type: 'varchar', length: 180 })
	idempotencyKey!: string;

	@Column({ name: 'external_operation_id', type: 'uuid', nullable: true })
	externalOperationId!: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt!: Date;
}
