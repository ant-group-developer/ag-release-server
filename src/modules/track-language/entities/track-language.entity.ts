import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('track_language')
export class TrackLanguage extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	metadataLanguageCountryId: string;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country;

	@Column({ type: 'uuid' })
	audioLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language;

	@Column({ type: 'uuid' })
	metadataLanguageId: string;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language;

	@Column({ type: 'varchar', length: 10 })
	trackId: string;

	@OneToOne(() => Track, (track) => track.trackLanguage)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
