import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('track_types', {
	comment: 'Danh mục loại track (original, instrumental, remix, v.v.)',
})
export class TrackType extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên loại track',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã loại track',
	})
	code: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu loại track mặc định',
	})
	isDefault: boolean;

	@OneToMany(() => Track, (track) => track.trackType)
	tracks: Track[];

	tracksCount?: number;
}
