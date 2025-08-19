import { COMMENT_FOR_NULLABLE_DRAFT } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';

@Entity('track_language')
export class TrackLanguage extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	metadataLanguageCountryId: string | null; // ngon ngu quoc gia

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	audioLanguageId: string | null; // ngon ngu bai hat

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	metadataLanguageId: string | null;

	@Column({ type: 'varchar', length: 10 })
	trackId: string;

	@Column({
		type: 'uuid',
		comment: COMMENT_FOR_NULLABLE_DRAFT,
		nullable: true,
	})
	recordingCountryId: string | null;

	// relation
	@ManyToOne(() => Country)
	@JoinColumn({ name: 'metadata_language_country_id' })
	metadataLanguageCountry: Country | null;

	@ManyToOne(() => Country)
	@JoinColumn({ name: 'recording_country_id' })
	recordingCountry: Country | null;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'audio_language_id' })
	audioLanguage: Language | null;

	@ManyToOne(() => Language)
	@JoinColumn({ name: 'metadata_language_id' })
	metadataLanguage: Language | null;

	@OneToOne(() => Track, (track) => track.trackLanguage)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
