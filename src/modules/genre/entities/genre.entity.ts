import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { lengthPicture } from 'src/modules/database/constants/database.constant';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('genres')
export class Genre extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: lengthPicture, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 200, nullable: true })
	description: string | null;

	// releases
	@OneToMany(() => Release, (release) => release.primaryGenre)
	primaryGenreReleases: Release[];

	@OneToMany(() => Release, (release) => release.subGenre)
	subGenreReleases: Release[];

	// tracks
	@OneToMany(() => Track, (track) => track.primaryGenre)
	primaryGenreTracks: Track[];

	@OneToMany(() => Track, (track) => track.subGenre)
	subGenreTracks: Track[];

	//user
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
