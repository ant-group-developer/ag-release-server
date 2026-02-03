import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'i18n' })
@Index(['key', 'locale'], { unique: true })
@Index(['locale'])
@Index(['key'])
export class I18nEntity {
	@PrimaryGeneratedColumn('increment', { type: 'bigint' })
	id: string;

	@Column({ name: 'key', type: 'text' })
	key: string;

	@Column({ type: 'varchar', length: 20 })
	locale: string;

	@Column({ name: 'value', type: 'text' })
	value: string;

	@Column({ type: 'text', nullable: true })
	description: string | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date;
}
