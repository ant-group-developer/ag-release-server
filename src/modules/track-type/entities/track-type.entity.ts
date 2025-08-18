import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('track_types')
export class TrackType extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 50, unique: true })
	code: string;

	// relation
	@OneToMany(() => Track, (track) => track.trackType)
	tracks: Track[];

	// count relation
	tracksCount?: number;
}
