import { Country } from 'src/country/entities/country.entity';
import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUUID } from 'src/database/entities/database.entity';
import { Language } from 'src/language/entities/language.entity';
import { Release } from 'src/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('release_language')
export class ReleaseLanguage extends BaseEntityUUID {
	@Column({ type: 'varchar', name: 'metadata_language_country_id' })
	metadataLanguageCountryId: string;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country;

	// @Column({
	// 	type: 'varchar',
	// 	name: 'audio_language_id',
	// 	length: LENGTH_ID.LANGUAGE,
	// })
	@Column('uuid')
	audioLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language;

	// @Column({
	// 	type: 'varchar',
	// 	name: 'metadata_language_id',
	// 	length: LENGTH_ID.LANGUAGE,
	// })
	@Column('uuid')
	metadataLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language;

	@Column({ type: 'varchar', length: LENGTH_ID.RELEASE, name: 'release_id' })
	releaseId: string;

	@OneToOne(() => Release, (release) => release.releaseLanguage)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
