import { BaseEntityShortId } from 'src/database/entities/database.entity';
import { Genre } from 'src/genre/entities/genre.entity';
import { Release } from 'src/release/entities/release.entity';
import { TrackArtist } from 'src/track-artist/entities/track-artist.entity';
import { TrackLanguage } from 'src/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/track-localize/entities/track-localize.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';

@Entity('tracks')
export class Track extends BaseEntityShortId {
	@Column({ type: 'varchar', length: 100 })
	title: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string;

	@Column({ type: 'varchar', length: 50, nullable: true })
	version: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	isrc: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	iswc: string;

	@Column({ name: 'release_id', type: 'varchar', length: 10 })
	releaseId: string;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;

	@Column({ name: 'primary_genre_id', type: 'varchar', length: 10 })
	primaryGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre;

	@Column({ name: 'sub_genre_id', type: 'varchar', length: 10 })
	subGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre;

	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.track)
	trackArtists: TrackArtist[];

	@OneToOne(() => TrackLanguage, (trackLanguage) => trackLanguage.track)
	trackLanguage: TrackLanguage;

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.track)
	trackLocalizes: TrackLocalize[];
}
