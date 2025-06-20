import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityUserCreatorUUID } from 'src/database/entities/database.entity';
import { Genre } from 'src/genre/entities/genre.entity';
import { Label } from 'src/label/entities/label.entity';
import { ReleaseArtist } from 'src/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/release-localize/entities/release-localize.entity';
import { Track } from 'src/track/entities/track.entity';
import { User } from 'src/user/entities/user.entity';
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
export class Release extends BaseEntityUserCreatorUUID {
	@Column({ type: 'varchar', length: 20, nullable: true })
	upc: string | null;

	@Column({
		name: 'primary_genre_id',
		type: 'varchar',
		length: LENGTH_ID.GENRE,
	})
	primaryGenreId: string;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'primary_genre_id' })
	primaryGenre: Genre;

	@Column({ type: 'varchar', length: LENGTH_ID.GENRE, nullable: true })
	subGenreId: string | null;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'sub_genre_id' })
	subGenre: Genre | null;

	@Column({ name: 'label_id', type: 'varchar', length: LENGTH_ID.RELEASE })
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

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
