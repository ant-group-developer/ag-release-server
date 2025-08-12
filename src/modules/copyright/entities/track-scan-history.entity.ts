import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { ResultScan } from '../interface/copyright.interface';

@Entity('track_scan_histories')
export class TrackScanHistory extends BaseUUIDEntity {
	@Column({ length: 10 })
	trackId: string;

	@Column({ type: 'jsonb' })
	result: ResultScan[];

	// relation
	@ManyToOne(() => Track, (track) => track.trackScanHistories)
	track: Track;
}
