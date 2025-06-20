import { generateId } from 'src/utils/generate-id';
import { CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export abstract class BaseUUIDEntity {
	@PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
	id: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}

export abstract class BaseCustomIDEntity {
	@PrimaryColumn({ default: generateId(), length: 10 })
	id: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
