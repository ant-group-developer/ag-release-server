import { Country } from 'src/country/entities/country.entity';
import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Language } from 'src/language/entities/language.entity';
import { Track } from 'src/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('track_language')
export class TrackLanguage extends BaseEntityLongId {
	@Column({
		name: 'metadata_language_country_id',
		length: LENGTH_ID.COUNTRY,
	})
	metadataLanguageCountryId: string;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country;

	@Column({ name: 'audio_language_id', length: LENGTH_ID.LANGUAGE })
	audioLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language;

	@Column({ name: 'metadata_language_id', length: LENGTH_ID.LANGUAGE })
	metadataLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language;

	@Column({
		name: 'track_id',
		type: 'varchar',
		length: LENGTH_ID.TRACK,
		nullable: false,
	})
	trackId: string;

	@OneToOne(() => Track, (track) => track.trackLanguage)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
