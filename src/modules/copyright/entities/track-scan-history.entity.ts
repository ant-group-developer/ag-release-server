import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { ResultScan } from '../interface/copyright.interface';

@Entity('track_scan_histories', {
	comment: 'Lịch sử quét bản quyền (copyright scan) của track',
})
export class TrackScanHistory extends BaseUUIDEntity {
	@Column({
		length: 10,
		comment: 'ID của track được quét',
	})
	trackId: string;

	@Column({
		type: 'jsonb',
		comment: 'Kết quả quét bản quyền, lưu dưới dạng danh sách JSON',
	})
	result: ResultScan[];

	@ManyToOne(() => Track, (track) => track.trackScanHistories)
	track: Track;
}
