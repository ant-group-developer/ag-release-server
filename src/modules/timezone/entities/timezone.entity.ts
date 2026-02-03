import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('timezones', {
	comment: 'Danh mục múi giờ dùng cho thời gian phát hành release',
})
export class Timezone extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên hiển thị của múi giờ',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Độ lệch UTC (ví dụ: +07:00)',
	})
	utc: string;

	@Column({
		type: 'varchar',
		length: 100,
		comment: 'Tên zone chuẩn (ví dụ: Asia/Ho_Chi_Minh)',
	})
	zone: string;

	@OneToMany(() => Release, (release) => release.timeZone)
	releases: Release[];

	releasesCount?: number;
}
