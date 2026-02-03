import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ArtistRole } from 'src/modules/artist-role/entities/artist-role.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';

@Entity('release_contributors', {
	comment:
		'Bảng liên kết contributor (nghệ sĩ tham gia) với release theo vai trò',
})
@Unique(['artistId', 'artistRoleId', 'releaseId'])
export class ReleaseContributor extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nghệ sĩ tham gia release',
	})
	artistId: string;

	@Column({
		type: 'uuid',
		comment: 'ID vai trò của nghệ sĩ trong release',
	})
	artistRoleId: string;

	@Column({
		type: 'uuid',
		comment: 'ID release',
	})
	releaseId: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Tự động thêm contributor này vào tất cả track thuộc release',
	})
	addContributorToTracks: boolean;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => ArtistRole)
	@JoinColumn({ name: 'artist_role_id' })
	artistRole: ArtistRole;

	@ManyToOne(() => Release)
	@JoinColumn({ name: 'release_id' })
	release: Release;
}
