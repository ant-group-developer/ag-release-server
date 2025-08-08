import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { Release } from 'src/modules/release/entities/release.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('labels')
export class Label extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: LENGTH_PICTURE, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	@OneToMany(() => Release, (release) => release.label)
	releases: Release[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// count relation
	releaseCount?: number;
	trackCount?: number;
}
