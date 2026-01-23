import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity({ name: 'deal_types' })
export class DealType extends BaseUserTrackedUUIDEntity {
	@Index({ unique: true })
	@Column({ type: 'varchar' })
	code: string;

	@Column({ type: 'varchar' })
	name: string;

	@Column({ name: 'requires_connection', type: 'boolean', default: true })
	requiresConnection: boolean;
}
