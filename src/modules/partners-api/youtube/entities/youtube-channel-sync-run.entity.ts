import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

export type YoutubeChannelSyncRunError = {
	youtubeChannelId: string;
	message: string;
};

@Entity('youtube_channel_sync_runs', {
	comment: 'Summary of every YouTube channel metadata sync execution',
})
@Index('IDX_youtube_channel_sync_runs_created_at', ['createdAt'])
export class YoutubeChannelSyncRun extends BaseUUIDEntity {
	@Column({ type: 'uuid', name: 'actor_id' })
	actorId: string;

	@Column({ type: 'boolean', default: false })
	force: boolean;

	@Column({ type: 'integer', name: 'total_channels', default: 0 })
	totalChannels: number;

	@Column({ type: 'integer', name: 'processed_channels', default: 0 })
	processedChannels: number;

	@Column({ type: 'integer', name: 'updated_channels', default: 0 })
	updatedChannels: number;

	@Column({ type: 'integer', name: 'updated_fields', default: 0 })
	updatedFields: number;

	@Column({ type: 'integer', name: 'no_change_channels', default: 0 })
	noChangeChannels: number;

	@Column({ type: 'integer', name: 'missing_youtube_channel_id', default: 0 })
	missingYoutubeChannelId: number;

	@Column({ type: 'integer', name: 'not_found_on_youtube', default: 0 })
	notFoundOnYoutube: number;

	@Column({ type: 'integer', name: 'failed_channels', default: 0 })
	failedChannels: number;

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	errors: YoutubeChannelSyncRunError[];

	@Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
	completedAt: Date | null;
}
