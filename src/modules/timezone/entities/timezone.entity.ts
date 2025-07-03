import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

@Entity('timezones')
export class Timezone extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 100 })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	utc: string;

	@Column({ type: 'varchar', length: 100 })
	zone: string;
}
