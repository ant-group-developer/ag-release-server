import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MediaUrlTransformer } from 'src/utils/util';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('genres', {
	comment: 'Danh mục thể loại nhạc, dùng cho release, track và artist',
})
export class Genre extends BaseUserTrackedCustomIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên thể loại nhạc',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã thể loại nhạc duy nhất',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: LENGTH_PICTURE,
		nullable: true,
		comment: 'Ảnh đại diện của thể loại',
		transformer: MediaUrlTransformer,
	})
	picture: string | null;

	@Column({
		type: 'varchar',
		length: 200,
		nullable: true,
		comment: 'Mô tả ngắn cho thể loại',
	})
	description: string | null;

	@OneToMany(() => Release, (release) => release.primaryGenre)
	primaryGenreReleases: Release[];

	@OneToMany(() => Release, (release) => release.subGenre)
	subGenreReleases: Release[];

	@OneToMany(() => Track, (track) => track.primaryGenre)
	primaryGenreTracks: Track[];

	@OneToMany(() => Track, (track) => track.subGenre)
	subGenreTracks: Track[];

	@OneToMany(() => Artist, (artist) => artist.genre)
	artists: Artist[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	primaryGenreReleasesCount?: number;
	subGenreReleasesCount?: number;
	primaryGenreTracksCount?: number;
	subGenreTracksCount?: number;
}
