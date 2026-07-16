import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('spotify_sonar_scan_schedules', {
	comment: 'Cấu hình lịch tự động lấy dữ liệu Spotify Sonar delivery + catalog',
})
export class SpotifySonarScanSchedule extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: 120, comment: 'Tên lịch quét' })
	name: string;

	@Column({ type: 'boolean', default: true, comment: 'Bật/tắt lịch' })
	enabled: boolean;

	@Column({ name: 'cron_expression', type: 'varchar', length: 100 })
	cronExpression: string;

	@Column({ type: 'varchar', length: 80, default: 'Asia/Ho_Chi_Minh' })
	timezone: string;

	@Column({
		name: 'is_imported_from_report',
		type: 'boolean',
		nullable: true,
		default: null,
		comment: 'true: chỉ release từ report, false: chỉ release không từ report, null: tất cả',
	})
	isImportedFromReport: boolean | null;

	@Column({ name: 'limit_count', type: 'integer', nullable: true, default: 500, comment: 'Số release tối đa mỗi lần chạy' })
	limitCount: number | null;

	@Column({ type: 'boolean', default: false, comment: 'Re-fetch release đã có data' })
	force: boolean;

	@Index()
	@Column({ name: 'is_deleted', type: 'boolean', default: false })
	isDeleted: boolean;

	@Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
	lastRunAt: Date | null;

	@Column({ name: 'last_scan_id', type: 'uuid', nullable: true })
	lastScanId: string | null;

	@Column({ name: 'last_skipped_at', type: 'timestamptz', nullable: true })
	lastSkippedAt: Date | null;

	@Column({ name: 'last_skip_reason', type: 'text', nullable: true })
	lastSkipReason: string | null;

	@Column({ name: 'last_error', type: 'text', nullable: true })
	lastError: string | null;
}
