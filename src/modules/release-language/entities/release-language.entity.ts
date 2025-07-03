import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_language')
export class ReleaseLanguage extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	metadataLanguageCountryId: string;

	@Column({ type: 'uuid' })
	audioLanguageId: string;

	@Column({ type: 'uuid' })
	metadataLanguageId: string;

	@Column({ type: 'uuid' })
	releaseId: string;

	// relation
	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language;

	@OneToOne(() => Release, (release) => release.releaseLanguage)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
