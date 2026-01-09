import { DEFAULT_CHUNK_DURATION } from 'src/common/constants/common.default.constants';
import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ScanStatus } from '../enums/copyright.enum';
import { TrackScanFilter } from '../interface/copyright.interface';

@Entity('track_scan_status', {
	comment: 'Trạng thái và cấu hình phiên quét bản quyền cho danh sách track',
})
export class TrackScanStatus extends BaseUserTrackedUUIDEntity {
	@Column({
		type: 'enum',
		enum: ScanStatus,
		comment: 'Trạng thái hiện tại của quá trình quét',
	})
	status: ScanStatus;

	@Column({
		type: 'int',
		default: DEFAULT_CHUNK_DURATION,
		comment: 'Độ dài mỗi đoạn audio khi quét (tính bằng giây)',
	})
	chunkDuration: number;

	@Column({
		type: 'jsonb',
		comment: 'Bộ lọc điều kiện dùng để chọn track cần quét',
	})
	filter: TrackScanFilter;

	@Column({
		type: 'varchar',
		length: 10,
		array: true,
		nullable: false,
		default: '{}',
		comment: 'Danh sách ID track cần được quét',
	})
	trackNeedScanIds: string[];

	@Column({
		type: 'varchar',
		length: 10,
		array: true,
		nullable: false,
		default: '{}',
		comment: 'Danh sách ID track đã được quét',
	})
	trackScannedIds: string[];

	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	trackNeedScan?: {
		id: string | null;
		title: string | null;
	}[];

	trackScanned?: {
		id: string | null;
		title: string | null;
	}[];
}
