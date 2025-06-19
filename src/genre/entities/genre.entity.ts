import { BaseEntityShortId } from 'src/database/entities/database.entity';
import { Release } from 'src/release/entities/release.entity';
import { Track } from 'src/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

console.log('Genre')

@Entity('genres')
export class Genre extends BaseEntityShortId {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
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
	primaryGenreTracks: Release[];

	@OneToMany(() => Track, (track) => track.subGenre)
	subGenreTracks: Release[];
}
