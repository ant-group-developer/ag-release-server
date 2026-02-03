import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity('currencies', {
	comment: 'Danh mục tiền tệ dùng trong hệ thống',
})
export class Currency extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		comment: 'Tên tiền tệ',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: 3,
		unique: true,
		comment: 'Mã tiền tệ theo chuẩn ISO 4217',
	})
	code: string;

	priceTierCount?: number;
}
