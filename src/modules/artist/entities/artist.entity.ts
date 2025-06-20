import { BaseUserTrackedCustomIDEntity } from 'src/common/entities/user-tracked.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('artists')
export class Artist extends BaseUserTrackedCustomIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	picture: string | null;

	@Column({ type: 'varchar', length: 250, nullable: true })
	biography: string | null;

	@OneToMany(() => ReleaseArtist, (releaseArtist) => releaseArtist.artist)
	releaseArtists: ReleaseArtist[];
}
