import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { MetadataScanSession } from './metadata-scan-session.entity';

@Entity('metadata_scan_schedules', {
	comment: 'Bảng cấu hình lịch tự động quét enrich metadata',
})
export class MetadataScanSchedule extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 120,
		comment: 'Tên lịch quét',
	})
	name: string;

	@Column({
		type: 'boolean',
		default: true,
		comment: 'Bật/tắt lịch quét',
	})
	enabled: boolean;

	@Column({
		name: 'cron_expression',
		type: 'varchar',
		length: 100,
		comment: 'Cron expression của lịch quét',
	})
	cronExpression: string;

	@Column({
		type: 'varchar',
		length: 80,
		default: 'Asia/Ho_Chi_Minh',
		comment: 'Timezone dùng để chạy cron',
	})
	timezone: string;

	@Column({
		name: 'is_imported_from_report',
		type: 'boolean',
		comment: 'true: quét release import từ report, false: quét release không import từ report',
	})
	isImportedFromReport: boolean;

	@Column({
		name: 'limit_count',
		type: 'integer',
		nullable: true,
		default: 500,
		comment: 'Giới hạn số release mỗi lần cron chạy',
	})
	limitCount: number | null;

	@Column({
		type: 'boolean',
		default: false,
		comment: 'Có force quét lại release đã enrich hay không',
	})
	force: boolean;

	@Index()
	@Column({
		name: 'is_deleted',
		type: 'boolean',
		default: false,
		comment: 'Soft delete schedule',
	})
	isDeleted: boolean;

	@Column({
		name: 'last_run_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm cron chạy gần nhất',
	})
	lastRunAt: Date | null;

	@Column({
		name: 'last_scan_id',
		type: 'uuid',
		nullable: true,
		comment: 'Scan ID gần nhất được tạo bởi schedule',
	})
	lastScanId: string | null;

	@Column({
		name: 'last_skipped_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm cron bị skip gần nhất',
	})
	lastSkippedAt: Date | null;

	@Column({
		name: 'last_skip_reason',
		type: 'text',
		nullable: true,
		comment: 'Lý do skip cron gần nhất',
	})
	lastSkipReason: string | null;

	@Column({
		name: 'last_error',
		type: 'text',
		nullable: true,
		comment: 'Lỗi gần nhất khi chạy cron',
	})
	lastError: string | null;

	@OneToMany(() => MetadataScanSession, (session) => session.schedule)
	sessions: MetadataScanSession[];
}
