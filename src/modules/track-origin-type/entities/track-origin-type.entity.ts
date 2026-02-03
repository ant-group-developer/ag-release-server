import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('track_origin_types', {
	comment: 'Danh mục nguồn gốc của track (original, cover, remix, AI, v.v.)',
})
export class TrackOriginType extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên loại nguồn gốc track',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã loại nguồn gốc track',
	})
	code: string;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Đánh dấu loại nguồn gốc mặc định',
	})
	isDefault: boolean;

	@OneToMany(() => Track, (track) => track.trackOriginType)
	tracks: Track[];

	tracksCount?: number;
}
