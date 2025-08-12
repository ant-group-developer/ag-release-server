import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { Column, Entity } from 'typeorm';
import { ScanStatus } from '../enums/copyright.enum';
import { TrackScanFilter } from '../interface/copyright.interface';

@Entity('track_scan_status')
export class TrackScanStatus extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'enum', enum: ScanStatus })
	status: ScanStatus;

	@Column({ type: 'jsonb' })
	filter: TrackScanFilter;

	// @Column({})
	// trackNeedScanCount: number;
	// trackScannedCount: number;
}
