import { Column } from 'typeorm';
import { BaseCustomIDEntity, BaseUUIDEntity } from './base.entity';

export abstract class BaseUserTrackedUUIDEntity extends BaseUUIDEntity {
	@Column({ type: 'uuid', default: process.env.DEFAULT_USER_ID })
	creatorId: string;

	@Column({ type: 'uuid', default: process.env.DEFAULT_USER_ID })
	modifierId: string;

	// @BeforeInsert()
	// setDefault() {
	// 	this.creatorId = this.creatorId || process.env.DEFAULT_USER_ID!;
	// 	this.modifierId = this.modifierId || process.env.DEFAULT_USER_ID!;
	// }
}

export abstract class BaseUserTrackedCustomIDEntity extends BaseCustomIDEntity {
	@Column({ type: 'uuid', default: process.env.DEFAULT_USER_ID })
	creatorId: string;

	@Column({ type: 'uuid', default: process.env.DEFAULT_USER_ID })
	modifierId: string;

	// @BeforeInsert()
	// setDefault() {
	// 	this.creatorId = this.creatorId || process.env.DEFAULT_USER_ID!;
	// 	this.modifierId = this.modifierId || process.env.DEFAULT_USER_ID!;
	// }
}
