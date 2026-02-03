import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_language', {
	comment:
		'Thông tin ngôn ngữ và quốc gia áp dụng cho metadata và audio của release',
})
export class ReleaseLanguage extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		nullable: true,
		comment:
			'Quốc gia dùng cho metadata ngôn ngữ ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	metadataLanguageCountryId: string | null;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'Ngôn ngữ audio của release ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	audioLanguageId: string | null;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'Ngôn ngữ metadata của release ' + COMMENT_FOR_NULLABLE_DRAFT,
	})
	metadataLanguageId: string | null;

	@Column({
		type: 'uuid',
		comment: 'ID release',
	})
	releaseId: string;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country | null;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language | null;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language | null;

	@OneToOne(() => Release, (release) => release.releaseLanguage)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
