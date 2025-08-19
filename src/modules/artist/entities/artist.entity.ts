import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { ArtistProfile } from 'src/modules/artist-profile/entities/artist-profile.entity';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('artists')
export class Artist extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: LENGTH_PICTURE, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 250, nullable: true })
	biography: string | null;

	// relations
	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artist)
	releaseArtists: ReleaseArtist[];

	@OneToMany(() => TrackArtist, (trackArtist) => trackArtist.artist)
	trackArtists: TrackArtist[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	@OneToMany(() => ArtistProfile, (artistProfile) => artistProfile.artist)
	artistProfiles: ArtistProfile[] | [];

	// count relation
	releaseCount?: number;
	trackCount?: number;
}
