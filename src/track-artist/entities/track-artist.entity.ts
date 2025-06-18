import { ArtistRole } from 'src/artist-role/entities/artist-role.entity';
import { Artist } from 'src/artist/entities/artist.entity';
import { LENGTH_ID } from 'src/database/const/database.const';
import { BaseEntityLongId } from 'src/database/entities/database.entity';
import { Track } from 'src/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('track_artist')
export class TrackArtist extends BaseEntityLongId {
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
		name: 'artist_role_id',
		type: 'varchar',
		length: LENGTH_ID.ARTIST_ROLE,
	})
	artistRoleId: string;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@Column({
		name: 'track_id',
		type: 'varchar',
		length: LENGTH_ID.TRACK,
	})
	trackId: string;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
