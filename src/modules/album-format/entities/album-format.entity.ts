import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('album_formats', {
	comment: 'Định nghĩa định dạng album kèm giới hạn số lượng track',
})
export class AlbumFormat extends BaseUserTrackedCustomIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên định dạng album',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã định dạng album duy nhất',
	})
	code: string;

	// @Column({
	// 	type: 'int',
	// 	comment: 'Số lượng track tối thiểu cho định dạng album này',
	// })
	// minTrackCount: number;

	// @Column({
	// 	type: 'int',
	// 	comment: 'Số lượng track tối đa cho định dạng album này',
	// })
	// maxTrackCount: number;

	@OneToMany(() => Release, (release) => release.albumFormat)
	releases: Release[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	releasesCount?: number;
}
