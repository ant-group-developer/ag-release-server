import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_PICTURE,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MediaUrlTransformer } from 'src/utils/util';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('track_sensitives', {
	comment:
		'Danh mục mức độ nhạy cảm nội dung của track (explicit, clean, v.v.)',
})
export class TrackSensitive extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên mức độ nhạy cảm của track',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã mức độ nhạy cảm',
	})
	code: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_PICTURE,
		nullable: true,
		comment: 'Icon đại diện cho mức độ nhạy cảm',
		transformer: MediaUrlTransformer,
	})
	icon: string | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;

	@OneToMany(() => Track, (track) => track.trackSensitive)
	tracks: Track[];

	trackCount?: number;
}
