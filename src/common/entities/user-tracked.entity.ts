import { Column } from 'typeorm';
import { BaseCustomIDEntity, BaseUUIDEntity } from './base.entity';

export abstract class BaseUserTrackedUUIDEntity extends BaseUUIDEntity {
	@Column({ type: 'uuid' })
	creatorId: string;

	@Column({ type: 'uuid' })
	modifierId: string;

	// @ManyToOne(() => User)
	// @JoinColumn({ name: 'creator_id' })
	// creator: User;

	// @ManyToOne(() => User)
	// @JoinColumn({ name: 'modifier_id' })
	// modifier: User;
}

export abstract class BaseUserTrackedCustomIDEntity extends BaseCustomIDEntity {
	@Column({ type: 'uuid' })
	creatorId: string;

	@Column({ type: 'uuid' })
	modifierId: string;

	// @ManyToOne(() => User)
	// @JoinColumn({ name: 'creator_id' })
	// creator: User;

	// @ManyToOne(() => User)
	// @JoinColumn({ name: 'modifier_id' })
	// modifier: User;
}
