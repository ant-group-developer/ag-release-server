import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('release_contributors')
@Unique(['artistId', 'artistRoleId', 'releaseId'])
export class ReleaseContributor extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 10 })
	artistId: string;

	@Column({ type: 'uuid' })
	artistRoleId: string;

	@Column({ type: 'uuid' })
	releaseId: string;

	@Column({ type: 'boolean', default: false })
	addContributorToTracks: boolean;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
