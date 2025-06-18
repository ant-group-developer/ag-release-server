import { BaseEntityUserCreatorLongId } from 'src/database/entities/database.entity';
import { ReleaseArtist } from 'src/release-artist/entities/release-artist.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('artist_roles')
export class ArtistRole extends BaseEntityUserCreatorLongId {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artistRole)
	releaseArtist: ReleaseArtist[];
}
