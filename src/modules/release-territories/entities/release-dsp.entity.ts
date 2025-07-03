import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DistributionType } from '../enum/release-dsp.enum';

@Entity('release_territories')
export class ReleaseTerritory extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'boolean', default: true })
	distributeWorldwide: boolean;

	@Column({
		type: 'enum',
		enum: DistributionType,
		nullable: true,
	})
	distributionType: DistributionType;

	@Column({ type: 'text', array: true })
	selectedCountries: string[];

	// Relations
	@ManyToOne(() => Release, (release) => release.releaseTerritories)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
