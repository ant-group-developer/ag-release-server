import { COMMENT_FOR_NULLABLE } from 'src/common/constants/common.default.constants';
import { BaseCustomIDEntity } from 'src/common/entities/base.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
import { lengthPicture } from 'src/modules/database/constants/database.constant';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { ITrack } from '../interfaces/track.interface';

@Entity('tracks')
export class Track extends BaseCustomIDEntity implements ITrack {
	@Column({ type: 'varchar', length: 100 })
	title: string;

	@Column({ type: 'varchar', length: lengthPicture, nullable: true })
	picture: string | null;

	@Column({
		type: 'varchar',
		length: 50,
		nullable: true,
		comment: `This will appear next to the track title excluding artist name. For example. 'Extended Version'This will appear next to the track title excluding artist name. For example. 'Extended Version'`,
	})
	version: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	isrc: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	iswc: string | null;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({
		type: 'varchar',
		length: 200,
		comment:
			'Example: 2025 Exclusive Licensed AMG' +
			' & ' +
			COMMENT_FOR_NULLABLE,
		nullable: true,
	})
	pLineOwner: string | null;

	@Column({
		type: 'varchar',
		length: 10,
		nullable: true,
		comment: COMMENT_FOR_NULLABLE,
	})
	primaryGenreId: string | null;

	@Column({ type: 'varchar', length: 10, nullable: true })
	subGenreId: string | null;

	// relation
	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre | null;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre | null;

	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.track)
	trackArtists: TrackArtist[];

	@OneToOne(() => TrackLanguage, (trackLanguage) => trackLanguage.track)
	trackLanguage: TrackLanguage;

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.track)
	trackLocalizes: TrackLocalize[];

	@OneToOne(() => AudioFile, (audioFile) => audioFile.track)
	audioFile: AudioFile;
}

// @Entity('tracks')
// export class Track extends BaseCustomIDEntity {
// 	@Column({ type: 'varchar', length: 100 })
// 	title: string;

// 	@Column({ type: 'varchar', length: lengthPicture, nullable: true })
// 	picture: string | null;

// 	@Column({
// 		type: 'varchar',
// 		length: 50,
// 		nullable: true,
// 		comment: `This will appear next to the track title excluding artist name. For example. 'Extended Version'This will appear next to the track title excluding artist name. For example. 'Extended Version'`,
// 	})
// 	version: string | null;

// 	@Column({ type: 'varchar', length: 20, nullable: true })
// 	isrc: string | null;

// 	@Column({ type: 'varchar', length: 20, nullable: true })
// 	iswc: string | null;

// 	@Column({ type: 'uuid' })
// 	releaseId: string;

// 	@Column({
// 		type: 'varchar',
// 		length: 200,
// 		comment: 'Example: 2025 Exclusive Licensed AMG',
// 	})
// 	pLineOwner: string;

// 	@Column({ type: 'varchar', length: 10 })
// 	primaryGenreId: string;

// 	@Column({ type: 'varchar', length: 10, nullable: true })
// 	subGenreId: string | null;

// 	// relation
// 	@ManyToOne(() => Release)
// 	@JoinColumn({ name: 'release_id' })
// 	release: Release;

// 	@ManyToOne(() => Genre)
// 	@JoinColumn({ name: 'primary_genre_id' })
// 	primaryGenre: Genre;

// 	@ManyToOne(() => Genre)
// 	@JoinColumn({ name: 'sub_genre_id' })
// 	subGenre: Genre | null;

// 	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.track)
// 	trackArtists: TrackArtist[];

// 	@OneToOne(() => TrackLanguage, (trackLanguage) => trackLanguage.track)
// 	trackLanguage: TrackLanguage;

// 	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.track)
// 	trackLocalizes: TrackLocalize[];

// 	@OneToOne(() => AudioFile, (audioFile) => audioFile.track)
// 	audioFile: AudioFile;
// }
