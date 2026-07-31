import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';

/**
 * ORM entity map bảng "distribution".
 * KHÔNG phải aggregate — chỉ là "cột DB". Repo dịch qua lại giữa row này và Distribution aggregate.
 * Cột khớp DistributionSnapshotRow (domain/distribution/distribution.types.ts).
 */
@Entity('distribution')
@Index('IDX_distribution_release_id', ['releaseId'])
@Index('IDX_distribution_state', ['state'])
@Index('IDX_distribution_correlation_id', ['correlationId'])
export class DistributionOrmEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@Column({ type: 'uuid' })
	releaseId!: string;

	@Column({ type: 'uuid' })
	snapshotId!: string;

	@Column({ type: 'uuid' })
	tenantId!: string;

	/** ExecutionType: INITIAL_RELEASE|UPDATE|TAKEDOWN|RETRY */
	@Column({ type: 'varchar', length: 30 })
	type!: string;

	@Column({ type: 'uuid' })
	correlationId!: string;

	/** DistributionState milestone. Default DRAFT khi INSERT (create fresh). */
	@Column({ type: 'varchar', length: 30, default: 'DRAFT' })
	state!: string;

	@Column({ type: 'varchar', length: 14, nullable: true })
	upc!: string | null;

	/**
	 * Map groupKey (dspRoute) → package path. 1 package/nhóm phân phối
	 * (Spotify direct + CI aggregator khác ernVersion/SFTP). {} khi chưa build.
	 */
	@Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
	packageUris!: Record<string, string>;

	@Column({ type: 'int', default: 0 })
	retryCount!: number;

	/** Optimistic lock: repo UPDATE ... WHERE version=? then version+1. Tự quản, không dùng @VersionColumn. */
	@Column({ type: 'int', default: 0 })
	version!: number;

	/**
	 * Immutable channel specs — set once at INSERT (fresh aggregate).
	 * Cần vì rehydrate phải re-spawn channels khi state chuyển vào DELIVERING sau load.
	 * jsonb (không Record<string, unknown>) tránh strict DeepPartial của TypeORM.
	 */
	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	channelSpecs!: object;
}
