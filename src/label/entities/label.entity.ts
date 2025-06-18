import { BaseEntityUserCreatorShortId } from 'src/database/entities/database.entity';
import { Release } from 'src/release/entities/release.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('labels')
export class Label extends BaseEntityUserCreatorShortId {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	@OneToMany(() => Release, (release) => release.label)
	releases: Release[];
}
