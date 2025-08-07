import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Dsp } from '../../dsp/entities/dsp.entity';
import { User } from '../../user/entities/user.entity';

@Entity('artist_profiles')
export class ArtistProfile extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 50 })
	name: string;

	@Column({ type: 'varchar', length: 100 })
	url: string;

	@Column({ type: 'varchar', length: 10 })
	dspId: string;

	@Column({ type: 'varchar', length: 10 })
	artistId: string;

	// relation
	@ManyToOne(() => Dsp, (dsp) => dsp.artistProfiles)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@ManyToOne(() => Artist)
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
