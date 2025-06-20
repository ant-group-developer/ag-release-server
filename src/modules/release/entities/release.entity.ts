import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import {
	Column,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	OneToOne,
} from 'typeorm';
import { ReleaseStatus, ReleaseType } from '../enum/release.enum';

@Entity('releases')
export class Release extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 20, nullable: true })
	upc: string | null;

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

	@Column({ name: 'label_id', type: 'varchar', length: 10 })
	labelId: string;

	@ManyToOne(() => Label)
	@JoinColumn({ name: 'label_id' })
	label: Label;

	@Column({ type: 'varchar', length: 150 })
	title: string;

	@Column({ type: 'varchar', length: 150, nullable: true })
	version: string | null;

	@Column({ type: 'enum', enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
	status: ReleaseStatus;

	@Column({ type: 'enum', enum: ReleaseType })
	type: ReleaseType;

	// tracks
	@OneToMany(() => Track, (track) => track.release)
	tracks: Track[];

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.release)
	releaseArtists: ReleaseArtist[];

	@OneToOne(
		() => ReleaseLanguage,
		(releaseLanguage) => releaseLanguage.release,
	)
	releaseLanguage: ReleaseLanguage;

	@OneToMany(
		() => ReleaseLocalize,
		(releaseLocalize) => releaseLocalize.release,
	)
	releaseLocalizes: ReleaseLocalize[];
}
