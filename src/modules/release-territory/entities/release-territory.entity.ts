import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { DistributionType } from '../enum/release-dsp.enum';

@Entity('release_territories')
export class ReleaseTerritory extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({
		type: 'boolean',
		default: true,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	distributeWorldwide: boolean | null;

	@Column({
		type: 'enum',
		enum: DistributionType,
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	distributionType: DistributionType | null;

	@Column({ type: 'uuid', array: true, nullable: true })
	selectedCountries: string[] | null;

	// Relations
	@OneToOne(() => Release, (release) => release.releaseTerritory)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
