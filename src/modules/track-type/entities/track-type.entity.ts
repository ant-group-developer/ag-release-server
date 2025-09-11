import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('track_types')
export class TrackType extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: DEFAULT_LENGTH_CODE, unique: true })
	code: string;

	@Column({ type: 'boolean', default: false })
	isDefault: boolean;

	// relation
	@OneToMany(() => Track, (track) => track.trackType)
	tracks: Track[];

	// count relation
	tracksCount?: number;
}
