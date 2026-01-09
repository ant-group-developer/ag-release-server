import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('track_artist', {
	comment: 'Bảng liên kết nghệ sĩ tham gia từng track',
})
@Unique(['artistId', 'trackId'])
export class TrackArtist extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID nghệ sĩ tham gia track',
	})
	artistId: string;

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
			'ID release_artist dùng để đồng bộ nghệ sĩ từ release xuống track',
	})
	releaseArtistId: string | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Được tạo tự động từ thao tác đồng bộ release',
	})
	isFromReleaseAction: boolean;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Được tạo từ thao tác chỉnh sửa trực tiếp trên track',
	})
	isFromTrackAction: boolean;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Track)
	@JoinColumn({ name: 'track_id' })
	track: Track;
}
