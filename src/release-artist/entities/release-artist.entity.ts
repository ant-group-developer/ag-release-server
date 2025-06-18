import { ArtistRole } from 'src/artist-role/entities/artist-role.entity';
import { Artist } from 'src/artist/entities/artist.entity';
import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Release } from 'src/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('release-artist')
export class ReleaseArtist extends BaseEntityLongId {
	@Column({
		name: 'artist_role_id',
		type: 'varchar',
		length: LENGTH_ID.ARTIST_ROLE,
	})
	artistRoleId: string;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@Column({
		name: 'artist_id',
		type: 'varchar',
		length: LENGTH_ID.ARTIST,
	})
	artistId: string;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@Column({
		name: 'release_id',
		type: 'varchar',
		length: LENGTH_ID.RELEASE,
	})
	releaseId: string;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
