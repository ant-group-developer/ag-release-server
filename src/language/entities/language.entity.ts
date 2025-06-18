import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { ReleaseLocalize } from 'src/release-localize/entities/release-localize.entity';
import { TrackLanguage } from 'src/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/track-localize/entities/track-localize.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('languages')
export class Language extends BaseEntityLongId {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10, unique: true })
	code: string;

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.audioLanguage,
	)
	audioLanguages: TrackLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.metadataLanguage,
	)
	metadataLanguages: TrackLanguage[];

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.language)
	trackLocalizes: TrackLocalize[];

	@OneToMany(
		() => ReleaseLocalize,
		(releaseLocalize) => releaseLocalize.language,
	)
	releaseLocalizes: ReleaseLocalize[];
}
