import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity('currencies')
export class Currency extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME })
	name: string;

	@Column({ type: 'varchar', length: 3, unique: true })
	code: string;
}
