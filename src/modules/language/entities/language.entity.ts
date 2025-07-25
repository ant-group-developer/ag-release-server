import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('languages')
export class Language extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10, unique: true })
	code: string;

	// release
	@OneToMany(
		() => ReleaseLocalize,
		(releaseLocalize) => releaseLocalize.language,
	)
	releaseLocalizes: ReleaseLocalize[];

	@OneToMany(
		() => ReleaseLanguage,
		(releaseAudioLanguage) => releaseAudioLanguage.audioLanguage,
	)
	releaseAudiolanguages: ReleaseLanguage[];

	@OneToMany(
		() => ReleaseLanguage,
		(releaseMetadataLanguage) => releaseMetadataLanguage.metadataLanguage,
	)
	releaseMetadataLanguages: ReleaseLanguage[];

	// track
	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.audioLanguage,
	)
	trackAudioLanguages: TrackLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.metadataLanguage,
	)
	trackMetadataLanguages: TrackLanguage[];

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.language)
	trackLocalizes: TrackLocalize[];

	// count relation
	releaseLocalizesCount?: number;
	releaseAudiolanguagesCount?: number;
	releaseMetadataLanguagesCount?: number;
	trackAudioLanguagesCount?: number;
	trackMetadataLanguagesCount?: number;
	trackLocalizesCount?: number;
}
