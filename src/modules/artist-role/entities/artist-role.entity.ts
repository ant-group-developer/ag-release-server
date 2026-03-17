import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('artist_roles', {
	comment: 'Danh mục vai trò của nghệ sĩ trong track hoặc release',
})
export class ArtistRole extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment:
			'Tên vai trò của nghệ sĩ (ví dụ: Main Artist, Featuring, Composer)',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã vai trò nghệ sĩ duy nhất trong hệ thống',
	})
	code: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
