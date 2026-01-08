import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('track_contributors')
@Unique(['artistId', 'artistRoleId', 'trackId'])
export class TrackContributor extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	artistId: string;

	@Column({ type: 'uuid' })
	artistRoleId: string;

	@Column({ type: 'varchar', length: 10 })
	trackId: string;

	@Column({
		type: 'uuid',
		nullable: true,
		comment: 'column for auto sync contributor from release',
	})
	releaseContributorId: string | null;

	@Column({ type: 'boolean', default: false })
	isFromReleaseAction: boolean;

	@Column({ type: 'boolean', default: false })
	isFromTrackAction: boolean;

	//
	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
