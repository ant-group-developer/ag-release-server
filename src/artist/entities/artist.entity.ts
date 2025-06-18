import { BaseEntityUserCreatorShortId } from 'src/database/entities/database.entity';
import { ReleaseArtist } from 'src/release-artist/entities/release-artist.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('artists')
export class Artist extends BaseEntityUserCreatorShortId {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string;

	@Column({ type: 'varchar', length: 250, nullable: true })
	biography: string;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artist)
	releaseArtists: ReleaseArtist[];
}
