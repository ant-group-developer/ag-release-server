import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';

@Entity('track_origin_types')
export class TrackOriginType extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	value: string;
}
