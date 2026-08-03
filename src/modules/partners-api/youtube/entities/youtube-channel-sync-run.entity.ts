import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { YoutubeChannelSyncRunStatus } from '../enum/youtube-channel-sync.enum';
import { YoutubeChannelSyncItem } from './youtube-channel-sync-item.entity';

@Entity('youtube_channel_sync_runs', {
	comment:
		'Batch scan YouTube channel metadata, staged before admin approval',
})
@Index('IDX_youtube_channel_sync_runs_status_created_at', [
	'status',
	'createdAt',
])
export class YoutubeChannelSyncRun extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 20,
		default: YoutubeChannelSyncRunStatus.PENDING,
	})
	status: YoutubeChannelSyncRunStatus;

	@Column({ type: 'uuid', name: 'requested_by' })
	requestedBy: string;

	@Column({ type: 'integer', name: 'total_channels', default: 0 })
	totalChannels: number;

	@Column({ type: 'integer', name: 'processed_channels', default: 0 })
	processedChannels: number;

	@Column({ type: 'integer', name: 'change_detected_count', default: 0 })
	changeDetectedCount: number;

	@Column({ type: 'integer', name: 'no_change_count', default: 0 })
	noChangeCount: number;

	@Column({
		type: 'integer',
		name: 'missing_youtube_channel_id_count',
		default: 0,
	})
	missingYoutubeChannelIdCount: number;

	@Column({ type: 'integer', name: 'not_found_count', default: 0 })
	notFoundCount: number;

	@Column({ type: 'integer', name: 'failed_count', default: 0 })
	failedCount: number;

	@Column({ type: 'timestamptz', name: 'started_at', nullable: true })
	startedAt: Date | null;

	@Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
	completedAt: Date | null;

	@Column({ type: 'text', name: 'error_summary', nullable: true })
	errorSummary: string | null;

	@OneToMany(() => YoutubeChannelSyncItem, (item) => item.run)
	items: YoutubeChannelSyncItem[];
}
