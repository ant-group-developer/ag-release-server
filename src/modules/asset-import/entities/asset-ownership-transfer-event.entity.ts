import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

/** Immutable audit event. Periods are the query model; events are the ledger. */
@Entity('asset_ownership_transfer_events')
@Index(['releaseId', 'effectiveDate'])
export class AssetOwnershipTransferEvent extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'uuid', nullable: true })
	fromTenantId: string | null;

	@Column({ type: 'varchar', length: 10, nullable: true })
	fromLabelId: string | null;

	@Column({ type: 'uuid' })
	toTenantId: string;

	@Column({ type: 'varchar', length: 10, nullable: true })
	toLabelId: string | null;

	@Column({ type: 'date' })
	effectiveDate: string;

	@Column({ type: 'date' })
	revenueEffectiveFrom: string;

	@Column({ type: 'varchar', length: 40, default: 'asset_import' })
	source: string;

	@Column({ type: 'uuid', nullable: true, unique: true })
	assetImportItemId: string | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy: string | null;

	@Column({ type: 'text', nullable: true })
	note: string | null;
}
