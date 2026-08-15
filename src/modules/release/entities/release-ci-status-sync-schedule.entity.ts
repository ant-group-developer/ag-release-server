import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity } from 'typeorm';
import { ReleaseStatus } from '../enum/release.enum';

@Entity('release_ci_status_sync_schedules', {
	comment: 'Cấu hình lịch đồng bộ trạng thái release từ CI',
})
export class ReleaseCiStatusSyncSchedule extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 120,
	})
	name: string;

	@Column({
		name: 'sync_status_enabled',
		type: 'boolean',
		default: false,
		comment: 'Bật hoặc tắt cron đồng bộ trạng thái release từ CI',
	})
	syncStatusEnabled: boolean;

	@Column({
		name: 'cron_expression',
		type: 'varchar',
		length: 100,
		default: '0 6 * * *',
		comment: 'Cron expression của lịch đồng bộ',
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
		name: 'release_statuses',
		type: 'varchar',
		array: true,
		default: () => "ARRAY['processing', 'failed']::varchar[]",
		comment: 'Danh sách trạng thái release cần đồng bộ từ CI',
	})
	releaseStatuses: ReleaseStatus[];

	@Column({
		name: 'batch_size',
		type: 'integer',
		default: 100,
		comment: 'Số release được lấy trong mỗi batch',
	})
	batchSize: number;

	@Column({
		type: 'integer',
		default: 3,
		comment: 'Số release được đồng bộ đồng thời',
	})
	concurrency: number;

	@Column({
		name: 'is_running',
		type: 'boolean',
		default: false,
		comment: 'Distributed lock cho cron và run-now',
	})
	isRunning: boolean;

	@Column({
		name: 'running_since',
		type: 'timestamptz',
		nullable: true,
	})
	runningSince: Date | null;

	@Column({
		name: 'running_by',
		type: 'uuid',
		nullable: true,
		comment: 'Token định danh lượt chạy đang giữ lock',
	})
	runningBy: string | null;

	@Column({
		name: 'restart_requested_at',
		type: 'timestamptz',
		nullable: true,
		comment: 'Thời điểm user yêu cầu dừng mềm và chạy lại',
	})
	restartRequestedAt: Date | null;

	@Column({
		name: 'last_run_at',
		type: 'timestamptz',
		nullable: true,
	})
	lastRunAt: Date | null;

	@Column({
		name: 'last_finished_at',
		type: 'timestamptz',
		nullable: true,
	})
	lastFinishedAt: Date | null;
}
