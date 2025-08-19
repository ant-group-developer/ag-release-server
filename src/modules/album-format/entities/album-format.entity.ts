import { DEFAULT_LENGTH_CODE, DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('album_formats')
export class AlbumFormat extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({ type: 'int' })
	minTrackCount: number;

	@Column({ type: 'int' })
	maxTrackCount: number;

	// releases
	@OneToMany(() => Release, (release) => release.albumFormat)
	releases: Release[];

	//user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// count relation
	releasesCount?: number;
}
