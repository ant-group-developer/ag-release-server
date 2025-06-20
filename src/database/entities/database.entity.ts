import { nanoid } from 'nanoid';
import {
	BeforeInsert,
	Column,
	CreateDateColumn,
	PrimaryColumn,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { LENGTH_ID } from '../const/database.const';

class BaseEntityCustomId {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_CUSTOM,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = nanoid(LENGTH_ID.BASE_CUSTOM);
	}

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}

class BaseEntityUUID {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}

class BaseEntityUserCreatorCustomId {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_CUSTOM,
	})
	id: string;

	@BeforeInsert()
	@Column({ name: 'creator_id', length: LENGTH_ID.USER })
	creatorId: string;

	@Column({ name: 'modifier_id', length: LENGTH_ID.USER })
	modifierId: string;

	@BeforeInsert()
	generateId() {
		this.id = nanoid(LENGTH_ID.BASE_CUSTOM);

		if (!this.creatorId) {
			this.creatorId = this.id;
		}
		if (!this.modifierId) {
			this.modifierId = this.id;
		}
	}

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}

class BaseEntityUserCreatorUUID {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_UUID,
	})
	id: string;

	@Column({ name: 'creator_id', length: LENGTH_ID.USER })
	creatorId: string;

	@Column({ name: 'modifier_id', length: LENGTH_ID.USER })
	modifierId: string;

	@BeforeInsert()
	generateId() {
		if (!this.creatorId) {
			this.creatorId = this.id;
		}
		if (!this.modifierId) {
			this.modifierId = this.id;
		}
	}

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}

export {
	BaseEntityCustomId,
	BaseEntityUserCreatorCustomId,
	BaseEntityUserCreatorUUID,
	BaseEntityUUID,
};
