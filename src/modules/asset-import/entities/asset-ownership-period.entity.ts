import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

/**
 * Immutable accounting window for a release owner. `validTo` is exclusive.
 * A release may have many windows, but active windows may never overlap.
 */
@Entity('asset_ownership_periods')
@Index(['releaseId', 'effectiveFrom'])
@Index(['tenantId', 'effectiveFrom'])
@Index(['labelId', 'effectiveFrom'])
export class AssetOwnershipPeriod extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'uuid' })
	tenantId: string;

	@Column({ type: 'varchar', length: 10, nullable: true })
	labelId: string | null;

	/** Used by trends/usage facts, whose grain can be daily. */
	@Column({ type: 'date' })
	effectiveFrom: string;

	@Column({ type: 'date', nullable: true })
	effectiveTo: string | null;

	/** Used by monthly settlement and revenue facts. */
	@Column({ type: 'date' })
	revenueEffectiveFrom: string;

	@Column({ type: 'date', nullable: true })
	revenueEffectiveTo: string | null;

	@Column({ type: 'uuid', nullable: true, unique: true })
	assetImportItemId: string | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy: string | null;

	@ManyToOne(() => Release, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@ManyToOne(() => Tenant, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@ManyToOne(() => Label, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'label_id' })
	label: Label | null;
}
