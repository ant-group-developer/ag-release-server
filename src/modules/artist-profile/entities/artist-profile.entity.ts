import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Dsp } from '../../dsp/entities/dsp.entity';
import { User } from '../../user/entities/user.entity';

@Entity('artist_profiles', {
	comment: 'Hồ sơ nghệ sĩ trên các nền tảng DSP bên ngoài',
})
export class ArtistProfile extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'varchar',
		length: 50,
		comment: 'Tên hiển thị hồ sơ nghệ sĩ trên DSP',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: 100,
		comment: 'URL công khai của hồ sơ nghệ sĩ trên DSP',
	})
	url: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nền tảng DSP',
	})
	dspId: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'ID nghệ sĩ trong hệ thống',
	})
	artistId: string;

	@ManyToOne(() => Dsp, (dsp) => dsp.artistProfiles)
	@JoinColumn({ name: 'dsp_id' })
	dsp: Dsp;

	@ManyToOne(() => Artist, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'artist_id' })
	artist: Artist;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User | null;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User | null;
}
