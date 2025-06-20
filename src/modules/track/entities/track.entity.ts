import { BaseCustomIDEntity } from 'src/common/entities/base.entity';
import { AudioFile } from 'src/modules/audio-file/entities/audio-file.entity';
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

@Entity('tracks')
export class Track extends BaseCustomIDEntity {
	@Column({ type: 'varchar', length: 100 })
	title: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string | null;

	// This will appear next to the track title excluding artist name. For example. 'Extended Version'
	@Column({ type: 'varchar', length: 50, nullable: true })
	version: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	isrc: string | null;

	@Column({ type: 'varchar', length: 20, nullable: true })
	iswc: string | null;

	@Column({ type: 'uuid' })
	releaseId: string;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ type: 'varchar' })
	primaryGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre;

	@Column({ type: 'varchar', length: 10, nullable: true })
	subGenreId: string | null;

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
