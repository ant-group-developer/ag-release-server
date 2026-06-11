import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('video_contributors', {
	comment: 'Bang lien ket contributor tham gia tung video',
})
@Unique(['artistId', 'artistRoleId', 'videoId'])
export class VideoContributor extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nghe si tham gia video',
	})
	artistId: string;

	@Column({
		type: 'uuid',
		comment: 'ID vai tro cua nghe si trong video',
	})
	artistRoleId: string;

	@Column({
		type: 'uuid',
		comment: 'ID video',
	})
	videoId: string;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Video, (video) => video.videoContributors, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'video_id' })
	video: Video;
}
