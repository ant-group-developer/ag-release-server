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
import { DatabaseConstant } from '../enum/database.type.enum';

export class BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DatabaseConstant.ID_DEFAULT_LENGTH,
	})
	id: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DatabaseConstant.ID_DEFAULT_LENGTH);
	}

	public generateIdByLength(length: number): string {
		return nanoid(length);
	}
}

export class BaseEntityShortId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DatabaseConstant.ID_SHORT_LENGTH,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DatabaseConstant.ID_SHORT_LENGTH);
	}
}

export class BaseEntityLongId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DatabaseConstant.ID_LONG_LENGTH,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DatabaseConstant.ID_LONG_LENGTH);
	}
}

export class BaseEntityUserCreatorDefaultId extends BaseEntityDefault {
	@Column({ name: 'creator_id', length: DatabaseConstant.ID_DEFAULT_LENGTH })
	creatorId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@Column({ name: 'modifier_id', length: DatabaseConstant.ID_DEFAULT_LENGTH })
	modifierId: string;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}

export class BaseEntityUserCreatorShortId extends BaseEntityUserCreatorDefaultId {
	@PrimaryColumn({
		type: 'varchar',
		length: DatabaseConstant.ID_SHORT_LENGTH,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DatabaseConstant.ID_SHORT_LENGTH);
	}
}

export class BaseEntityUserCreatorLongId extends BaseEntityUserCreatorDefaultId {
	@PrimaryColumn({
		type: 'varchar',
		length: DatabaseConstant.ID_LONG_LENGTH,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DatabaseConstant.ID_LONG_LENGTH);
	}
}
