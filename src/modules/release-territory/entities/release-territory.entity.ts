import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { DistributionType } from '../enum/release-dsp.enum';

@Entity('release_territories', {
	comment: 'Cấu hình lãnh thổ phân phối cho release',
})
export class ReleaseTerritory extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID release',
	})
	releaseId: string;

	@Column({
		type: 'boolean',
		default: true,
		nullable: true,
		comment: 'Phân phối toàn cầu ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	distributeWorldwide: boolean | null;

	@Column({
		type: 'enum',
		enum: DistributionType,
		nullable: true,
		comment: 'Loại phân phối theo lãnh thổ ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	distributionType: DistributionType | null;

	@Column({
		type: 'uuid',
		array: true,
		nullable: true,
		comment: 'Danh sách quốc gia được chọn để phân phối',
	})
	selectedCountries: string[] | null;

	@OneToOne(() => Release, (release) => release.releaseTerritory)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
