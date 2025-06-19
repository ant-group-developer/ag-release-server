import { nanoid } from 'nanoid';
import { User } from 'src/user/entities/user.entity';
import {
	BeforeInsert,
	Column,
	CreateDateColumn,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';
import { LENGTH_ID } from '../const/database.const';

export class BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_DEFAULT,
	})
	id: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(LENGTH_ID.BASE_DEFAULT);
	}

	public generateIdByLength(length: number): string {
		return nanoid(length);
	}
}

export class BaseEntityShortId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_SHORT,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(LENGTH_ID.BASE_SHORT);
	}
}

export class BaseEntityLongId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_LONG,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(LENGTH_ID.BASE_LONG);
	}
}

export class BaseEntityUserCreatorDefaultId extends BaseEntityDefault {
	@Column({ name: 'creator_id', length: LENGTH_ID.USER })
	creatorId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@Column({ name: 'modifier_id', length: LENGTH_ID.USER })
	modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@BeforeInsert()
	setDefaultIds() {
		if (!this.creatorId) {
			this.creatorId = this.id;
		}
		if (!this.modifierId) {
			this.modifierId = this.id;
		}
	}
}

export class BaseEntityUserCreatorShortId extends BaseEntityUserCreatorDefaultId {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_SHORT,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(LENGTH_ID.BASE_SHORT);
	}
}

export class BaseEntityUserCreatorLongId extends BaseEntityUserCreatorDefaultId {
	@PrimaryColumn({
		type: 'varchar',
		length: LENGTH_ID.BASE_LONG,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		if (!this.modifierId) {
			this.id = this.generateIdByLength(LENGTH_ID.BASE_LONG);
		}
	}
}
