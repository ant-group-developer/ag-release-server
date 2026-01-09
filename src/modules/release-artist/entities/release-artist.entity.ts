import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('release_artist', {
	comment: 'Bảng liên kết nghệ sĩ tham gia release',
})
@Unique(['artistId', 'releaseId'])
export class ReleaseArtist extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nghệ sĩ tham gia release',
	})
	artistId: string;

	@Column({
		type: 'uuid',
		comment: 'ID release',
	})
	releaseId: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Tự động thêm nghệ sĩ này vào tất cả track thuộc release',
	})
	addArtistToTracks: boolean;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
