import { BaseUserTrackedUUIDEntity } from 'src/common/entities/user-tracked.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ScanStatus } from '../enums/copyright.enum';
import { TrackScanFilter } from '../interface/copyright.interface';

@Entity('track_scan_status')
export class TrackScanStatus extends BaseUserTrackedUUIDEntity {
	@Column({ type: 'enum', enum: ScanStatus })
	status: ScanStatus;

	@Column({ type: 'jsonb' })
	filter: TrackScanFilter;

	@Column({ type: 'int', default: 0 })
	trackNeedScanCount: number;

	@Column({ type: 'int', default: 0 })
	trackScannedCount: number;

	@Column({
		type: 'varchar',
		length: 10,
		array: true,
		nullable: false,
		default: '{}',
	})
	trackIdsToScan: string[];

	// relation
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// virtual column
	tracksToScan?: {
		id: string | null;
		title: string | null;
	}[];
}
