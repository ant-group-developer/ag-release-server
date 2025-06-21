import { BeforeInsert, Column } from 'typeorm';
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
	@BeforeInsert()
	setDefaultIds() {
		this.creatorId = this.creatorId || process.env.DEFAULT_USER_ID!;
		this.modifierId = this.modifierId || process.env.DEFAULT_USER_ID!;
	}
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

	@BeforeInsert()
	setDefaultIds() {
		this.creatorId = this.creatorId || process.env.DEFAULT_USER_ID!;
		this.modifierId = this.modifierId || process.env.DEFAULT_USER_ID!;
	}
}
