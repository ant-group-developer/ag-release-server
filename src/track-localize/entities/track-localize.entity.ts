import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Language } from 'src/language/entities/language.entity';
import { Track } from 'src/track/entities/track.entity';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('track_localize')
export class TrackLocalize extends BaseEntityLongId {
	@Column({
		name: 'language_id',
		type: 'varchar',
		length: LENGTH_ID.LANGUAGE,
	})
	languageId: string;

	@ManyToOne(() => Language, (language) => language.trackLocalizes)
	language: Language;

	@Column({ name: 'track_id', type: 'varchar', length: LENGTH_ID.TRACK })
	trackId: string;

	@ManyToOne(() => Track, (track) => track.trackLocalizes)
	track: Track;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;
}
