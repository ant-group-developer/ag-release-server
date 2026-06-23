import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('video_genres', {
	comment: 'Bảng liên kết genre với video - quan hệ nhiều nhiều',
})
@Unique(['videoId', 'genreId'])
export class VideoGenre extends BaseUUIDEntity {
	@Column({
		type: 'uuid',
		comment: 'ID video',
	})
	videoId: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID genre',
	})
	genreId: string;

	@ManyToOne(() => Video, (video) => video.videoGenres, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'video_id' })
	video: Video;

	@ManyToOne(() => Genre)
	@JoinColumn({ name: 'genre_id' })
	genre: Genre;
}
