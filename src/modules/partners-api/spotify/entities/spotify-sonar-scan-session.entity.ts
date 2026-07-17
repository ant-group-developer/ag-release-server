import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { SpotifySonarScanSchedule } from './spotify-sonar-scan-schedule.entity';

export enum SonarScanSessionStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
}

export enum SonarScanTriggerType {
	MANUAL = 'MANUAL',
	CRON = 'CRON',
}

@Entity('sonar_scan_sessions', {
	comment: 'Lịch sử các lượt quét Spotify Sonar delivery + catalog',
})
export class SpotifySonarScanSession extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		default: SonarScanSessionStatus.PENDING,
		comment: 'Trạng thái: PENDING, PROCESSING, COMPLETED, FAILED',
	})
	status: SonarScanSessionStatus;

	@Column({
		name: 'total_releases',
		type: 'integer',
		default: 0,
		comment: 'Tổng số release đưa vào scan',
	})
	totalReleases: number;

	@Column({
		name: 'processed_releases',
		type: 'integer',
		default: 0,
		comment: 'Số release đã xử lý xong',
	})
	processedReleases: number;

	@Column({
		name: 'success_count',
		type: 'integer',
		default: 0,
		comment: 'Số release scan thành công',
	})
	successCount: number;

	@Column({
		name: 'failed_count',
		type: 'integer',
		default: 0,
		comment: 'Số release bị lỗi',
	})
	failedCount: number;

	@Column({
		name: 'force',
		type: 'boolean',
		default: false,
		comment: 'Bỏ qua dedup 24h, quét lại tất cả',
	})
	force: boolean;

	@Column({
		name: 'trigger_type',
		type: 'varchar',
		length: 20,
		default: SonarScanTriggerType.MANUAL,
		comment: 'Nguồn kích hoạt: MANUAL hoặc CRON',
	})
	triggerType: SonarScanTriggerType;

	@Column({
		name: 'schedule_id',
		type: 'uuid',
		nullable: true,
		comment: 'ID schedule nếu được trigger bởi cron',
	})
	scheduleId: string | null;

	@Column({
		name: 'is_imported_from_report',
		type: 'boolean',
		nullable: true,
		comment: 'Filter theo nguồn import',
	})
	isImportedFromReport: boolean | null;

	@Column({
		name: 'limit_count',
		type: 'integer',
		nullable: true,
		comment: 'Giới hạn số release tối đa',
	})
	limitCount: number | null;

	@Column({
		name: 'error_message',
		type: 'text',
		nullable: true,
		comment: 'Chi tiết lỗi nếu status = FAILED',
	})
	errorMessage: string | null;

	@Column({
		name: 'started_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm bắt đầu xử lý',
	})
	startedAt: Date | null;

	@Column({
		name: 'finished_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm hoàn thành hoặc thất bại',
	})
	finishedAt: Date | null;

	@ManyToOne(() => SpotifySonarScanSchedule, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'schedule_id' })
	schedule: SpotifySonarScanSchedule | null;
}
