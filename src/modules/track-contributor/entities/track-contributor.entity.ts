import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('track_contributors', {
	comment:
		'Bảng liên kết contributor (nghệ sĩ + vai trò) tham gia từng track',
})
@Unique(['artistId', 'artistRoleId', 'trackId'])
export class TrackContributor extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID nghệ sĩ tham gia track',
	})
	artistId: string;

	@Column({
		type: 'uuid',
		comment: 'ID vai trò của nghệ sĩ trong track',
	})
	artistRoleId: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID track',
	})
	trackId: string;

	@Column({
		type: 'uuid',
		nullable: true,
		comment:
			'ID release_contributor để đồng bộ contributor từ release xuống track',
	})
	releaseContributorId: string | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Được tạo tự động từ thao tác đồng bộ contributor từ release',
	})
	isFromReleaseAction: boolean;

	@Column({
		type: 'boolean',
		default: false,
		comment:
			'Được tạo từ thao tác chỉnh sửa contributor trực tiếp trên track',
	})
	isFromTrackAction: boolean;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Track, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
