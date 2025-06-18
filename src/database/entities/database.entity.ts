import { nanoid } from 'nanoid';
import { IUserSchema } from 'src/user/interface/user.interface';
import {
	BeforeInsert,
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';
import { DBConst } from '../enum/database.type.enum';

export class BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.DEFAULT,
	})
	id: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.DEFAULT);
	}

	public generateIdByLength(length: number): string {
		return nanoid(length);
	}
}

export class BaseEntityShortId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.SHORT,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.SHORT);
	}
}

export class BaseEntityLongId extends BaseEntityDefault {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.LONG,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.LONG);
	}
}

// export class BaseEntityUserCreatorDefaultId extends BaseEntityDefault {
// 	@Column({ name: 'creator_id', length: DBConst.LENGTH_ID.DEFAULT })
// 	creatorId: string;

// 	@ManyToOne(() => UserEntity)
// 	@JoinColumn({ name: 'creator_id' })
// 	creator: IUserSchema;

// 	@Column({ name: 'modifier_id', length: DBConst.LENGTH_ID.DEFAULT })
// 	modifierId: string;

// 	@ManyToOne(() => UserEntity)
// 	@JoinColumn({ name: 'modifier_id' })
// 	modifier: IUserSchema;
// }

// export class BaseEntityUserCreatorShortId extends BaseEntityUserCreatorDefaultId {
// 	@PrimaryColumn({
// 		type: 'varchar',
// 		length: DBConst.LENGTH_ID.SHORT,
// 	})
// 	id: string;

// 	@BeforeInsert()
// 	generateId() {
// 		this.id = this.generateIdByLength(DBConst.LENGTH_ID.SHORT);
// 	}
// }

@Entity('users')
export class BaseUser {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.DEFAULT,
	})
	id: string;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;

	@Column({ name: 'creator_id', length: DBConst.LENGTH_ID.DEFAULT })
	creatorId: string;

	@ManyToOne(() => BaseUser)
	@JoinColumn({ name: 'creator_id' })
	creator: IUserSchema;

	@Column({ name: 'modifier_id', length: DBConst.LENGTH_ID.DEFAULT })
	modifierId: string;

	@ManyToOne(() => BaseUser)
	@JoinColumn({ name: 'modifier_id' })
	modifier: IUserSchema;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.DEFAULT);
	}

	public generateIdByLength(length: number): string {
		return nanoid(length);
	}
}

// export class BaseEntityUserCreatorDefaultId extends BaseEntityDefault {
// 	@Column({ name: 'creator_id', length: DBConst.LENGTH_ID.DEFAULT })
// 	creatorId: string;

// 	@ManyToOne(() => UserEntity)
// 	@JoinColumn({ name: 'creator_id' })
// 	creator: IUserSchema;

// 	@Column({ name: 'modifier_id', length: DBConst.LENGTH_ID.DEFAULT })
// 	modifierId: string;

// 	@ManyToOne(() => UserEntity)
// 	@JoinColumn({ name: 'modifier_id' })
// 	modifier: IUserSchema;
// }

export class BaseEntityUserCreatorShortId extends BaseUser {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.SHORT,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.SHORT);
	}
}

export class BaseEntityUserCreatorLongId extends BaseUser {
	@PrimaryColumn({
		type: 'varchar',
		length: DBConst.LENGTH_ID.LONG,
	})
	id: string;

	@BeforeInsert()
	generateId() {
		this.id = this.generateIdByLength(DBConst.LENGTH_ID.LONG);
	}
}
