import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('track_artist')
export class TrackArtist extends BaseUUIDEntity {
	@Column({ type: 'varchar' })
	artistId: string;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@Column({ type: 'varchar' })
	artistRoleId: string;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@Column({ type: 'varchar' })
	trackId: string;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
