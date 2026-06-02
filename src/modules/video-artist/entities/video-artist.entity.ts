import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('video_artist', {
	comment: 'Bang lien ket nghe si tham gia tung video',
})
@Unique(['artistId', 'videoId'])
export class VideoArtist extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nghe si tham gia video',
	})
	artistId: string;

	@Column({
		type: 'uuid',
		comment: 'ID video',
	})
	videoId: string;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Video, (video) => video.videoArtists, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'video_id' })
	video: Video;
}
