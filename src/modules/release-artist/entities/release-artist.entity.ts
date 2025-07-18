import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release_artist')
export class ReleaseArtist extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	artistRoleId: string;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'boolean', default: false })
	addArtistToTracks: boolean;

	//relation
	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@Column({ type: 'varchar', length: 10 })
	artistId: string;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
