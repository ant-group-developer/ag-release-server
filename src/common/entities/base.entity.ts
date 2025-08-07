import { nanoid } from 'nanoid';
import {
	BeforeInsert,
	CreateDateColumn,
	PrimaryColumn,
	UpdateDateColumn,
} from 'typeorm';

export abstract class BaseUUIDEntity {
	@PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
	// @PrimaryColumn('uuid')
	// @PrimaryGeneratedColumn('uuid')
	id: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}

export abstract class BaseCustomIDEntity {
	// @PrimaryColumn({ default: generateId(), length: 10 })
	@PrimaryColumn({ type: 'varchar', length: 10 })
	id: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;

	@BeforeInsert()
	generateId() {
		this.id = nanoid(10);
	}
}
