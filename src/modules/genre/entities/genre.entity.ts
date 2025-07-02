import { BaseCustomIDEntity } from 'src/common/entities/base.entity';
import { lengthPicture } from 'src/modules/database/constants/database.constant';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('genres')
export class Genre extends BaseCustomIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: lengthPicture, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	// releases
	@OneToMany(() => Release, (release) => release.primaryGenre)
	primaryGenreReleases: Release[];

	@OneToMany(() => Release, (release) => release.subGenre)
	subGenreReleases: Release[];

	// tracks
	@OneToMany(() => Track, (track) => track.primaryGenre)
	primaryGenreTracks: Track[];

	@OneToMany(() => Track, (track) => track.subGenre)
	subGenreTracks: Track[];
}
