import { Column } from 'typeorm';
import { BaseCustomIDEntity, BaseUUIDEntity } from './base.entity';

export abstract class BaseUserTrackedUUIDEntity extends BaseUUIDEntity {
	@Column({ type: 'uuid', nullable: true })
	creatorId: string | null;

	@Column({ type: 'uuid', nullable: true })
	modifierId: string | null;
}

export abstract class BaseUserTrackedCustomIDEntity extends BaseCustomIDEntity {
	@Column({ type: 'uuid', nullable: true })
	creatorId: string | null;

	@Column({ type: 'uuid', nullable: true })
	modifierId: string | null;
}
