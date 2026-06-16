import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';

export enum ScanSessionStatus {
	PENDING = 'PENDING',
	PROCESSING = 'PROCESSING',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
}

@Entity('metadata_scan_sessions', {
	comment: 'Bảng lưu lịch sử các lượt quét (scan) enrich metadata',
})
export class MetadataScanSession extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		default: ScanSessionStatus.PENDING,
		comment: 'Trạng thái lượt quét: PENDING, PROCESSING, COMPLETED, FAILED',
	})
	status: ScanSessionStatus;

	@Column({
		name: 'total_releases',
		type: 'integer',
		default: 0,
		comment: 'Tổng số release cần quét trong lượt này',
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
		comment: 'Số release được enrich thành công',
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
		name: 'not_found_count',
		type: 'integer',
		default: 0,
		comment: 'Số release không tìm thấy trên Spotify/Deezer',
	})
	notFoundCount: number;

	@Column({
		name: 'dry_run',
		type: 'boolean',
		default: false,
		comment: 'Chế độ chạy thử không ghi DB',
	})
	dryRun: boolean;

	@Column({
		name: 'force',
		type: 'boolean',
		default: false,
		comment: 'Chế độ bắt buộc quét lại',
	})
	force: boolean;

	@Column({
		name: 'limit_count',
		type: 'integer',
		nullable: true,
		comment: 'Giới hạn số lượng release cần quét',
	})
	limitCount: number;

	@Column({
		name: 'error_message',
		type: 'text',
		nullable: true,
		comment: 'Lỗi chi tiết nếu status = FAILED',
	})
	errorMessage: string;

	@Column({
		name: 'started_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm bắt đầu chạy',
	})
	startedAt: Date;

	@Column({
		name: 'finished_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm hoàn thành hoặc thất bại',
	})
	finishedAt: Date;
}
