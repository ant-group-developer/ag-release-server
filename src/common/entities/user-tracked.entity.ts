import { Column } from 'typeorm';
import { BaseCustomIDEntity, BaseUUIDEntity } from './base.entity';

export abstract class BaseUserTrackedUUIDEntity extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	creatorId: string;

	@Column({ type: 'uuid' })
	modifierId: string;
}

export abstract class BaseUserTrackedCustomIDEntity extends BaseCustomIDEntity {
	@Column({ type: 'uuid' })
	creatorId: string;

	@Column({ type: 'uuid' })
	modifierId: string;
}
