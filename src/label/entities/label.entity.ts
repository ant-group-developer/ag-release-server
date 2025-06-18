import { BaseEntityUserCreatorShortId } from 'src/database/entities/database.entity';
import { Release } from 'src/release/entities/release.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('labels')
export class Label extends BaseEntityUserCreatorShortId {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100 })
	picture: string;

	@Column({ type: 'varchar', length: 200 })
	description: string;

	@OneToMany(() => Release, (release) => release.label)
	releases: Release[];
}
