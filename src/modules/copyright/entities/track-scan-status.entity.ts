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

	@Column({
		type: 'varchar',
		length: 10,
		array: true,
		nullable: false,
		default: '{}',
	})
	trackNeedScanIds: string[];

	@Column({
		type: 'varchar',
		length: 10,
		array: true,
		nullable: false,
		default: '{}',
	})
	trackScannedIds: string[];

	// relation
	@ManyToOne(() => User)
	@JoinColumn({ name: 'creator_id' })
	creator: User;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'modifier_id' })
	modifier: User;

	// virtual column
	trackNeedScan?: {
		id: string | null;
		title: string | null;
	}[];

	trackScanned?: {
		id: string | null;
		title: string | null;
	}[];
}
