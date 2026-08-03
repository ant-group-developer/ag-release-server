import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
	YoutubeChannelSyncResult,
	YoutubeChannelSyncReviewStatus,
} from '../enum/youtube-channel-sync.enum';
import { YoutubeChannelSyncRun } from './youtube-channel-sync-run.entity';

@Entity('youtube_channel_sync_items', {
	comment: 'Per-channel YouTube sync comparison and admin review decision',
})
@Index(
	'UQ_youtube_channel_sync_items_run_channel',
	['syncRunId', 'channelId'],
	{
		unique: true,
	},
)
@Index('IDX_youtube_channel_sync_items_run_result_review', [
	'syncRunId',
	'syncResult',
	'reviewStatus',
])
export class YoutubeChannelSyncItem extends BaseUUIDEntity {
	@Column({ type: 'uuid', name: 'sync_run_id' })
	syncRunId: string;

	@ManyToOne(() => YoutubeChannelSyncRun, (run) => run.items, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'sync_run_id' })
	run: YoutubeChannelSyncRun;

	@Column({ type: 'uuid', name: 'channel_id', nullable: true })
	channelId: string | null;

	@ManyToOne(() => Channel, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'channel_id' })
	channel: Channel | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'youtube_channel_id',
		nullable: true,
	})
	youtubeChannelId: string | null;

	@Column({ type: 'varchar', length: 200, name: 'current_name' })
	currentName: string;

	@Column({
		type: 'varchar',
		length: 200,
		name: 'proposed_name',
		nullable: true,
	})
	proposedName: string | null;

	@Column({
		type: 'varchar',
		length: 500,
		name: 'current_thumb_url',
		nullable: true,
	})
	currentThumbUrl: string | null;

	@Column({
		type: 'varchar',
		length: 500,
		name: 'proposed_thumb_url',
		nullable: true,
	})
	proposedThumbUrl: string | null;

	@Column({
		type: 'jsonb',
		name: 'changed_fields',
		default: () => "'[]'::jsonb",
	})
	changedFields: Array<'name' | 'thumbUrl'>;

	@Column({ type: 'varchar', length: 40, name: 'sync_result' })
	syncResult: YoutubeChannelSyncResult;

	@Column({
		type: 'varchar',
		length: 20,
		name: 'review_status',
		nullable: true,
	})
	reviewStatus: YoutubeChannelSyncReviewStatus | null;

	@Column({ type: 'timestamptz', name: 'channel_updated_at_snapshot' })
	channelUpdatedAtSnapshot: Date;

	@Column({ type: 'uuid', name: 'reviewed_by', nullable: true })
	reviewedBy: string | null;

	@Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
	reviewedAt: Date | null;

	@Column({ type: 'timestamptz', name: 'applied_at', nullable: true })
	appliedAt: Date | null;

	@Column({ type: 'text', nullable: true })
	note: string | null;

	@Column({ type: 'text', name: 'error_message', nullable: true })
	errorMessage: string | null;
}
