import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('labels')
export class Label extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	@OneToMany(() => Release, (release) => release.label)
	releases: Release[];
}
