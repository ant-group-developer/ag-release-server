import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('artist_roles')
export class ArtistRole extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artistRole)
	releaseArtists: ReleaseArtist[];
}
