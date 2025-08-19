import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_language')
export class ReleaseLanguage extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	metadataLanguageCountryId: string | null;

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	audioLanguageId: string | null;

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	metadataLanguageId: string | null;

	@Column({ type: 'uuid' })
	releaseId: string;

	// relation
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
