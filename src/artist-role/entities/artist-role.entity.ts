import { BaseEntityUserCreatorUUID } from 'src/database/entities/database.entity';
import { ReleaseArtist } from 'src/release-artist/entities/release-artist.entity';
import { User } from 'src/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('artist_roles')
export class ArtistRole extends BaseEntityUserCreatorUUID {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artistRole)
	releaseArtists: ReleaseArtist[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;
}
