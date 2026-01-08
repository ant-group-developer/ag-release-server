import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('artist_roles')
export class ArtistRole extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	// @OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artistRole)
	// releaseArtists: ReleaseArtist[];

	// @OneToMany(() => TrackArtist, (trackArtist) => trackArtist.artistRole)
	// trackArtists: TrackArtist[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	releaseCount?: number;
	trackCount?: number;
}
