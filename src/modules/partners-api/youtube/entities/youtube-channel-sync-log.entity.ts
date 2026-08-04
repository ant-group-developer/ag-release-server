import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('youtube_channel_sync_logs', {
	comment:
		'Audit log for each channel field changed by YouTube metadata sync',
})
@Index('IDX_youtube_channel_sync_logs_channel_created_at', [
	'channelId',
	'createdAt',
])
export class YoutubeChannelSyncLog extends BaseUUIDEntity {
	@Column({ type: 'uuid', name: 'channel_id', nullable: true })
	channelId: string | null;

	/** Channel is retained in the log response so the admin log table can render it directly. */
	@ManyToOne(() => Channel, { nullable: true })
	@JoinColumn({ name: 'channel_id' })
	channel: Channel | null;

	@Column({ type: 'uuid', name: 'run_id', nullable: true })
	runId: string | null;

	@Column({ type: 'varchar', length: 100, name: 'youtube_channel_id' })
	youtubeChannelId: string;

	@Column({ type: 'uuid', name: 'actor_id' })
	actorId: string;

	@Column({ type: 'boolean', default: false })
	force: boolean;

	@Column({ type: 'varchar', length: 100, name: 'field_name' })
	fieldName: 'name' | 'thumb_url';

	@Column({ type: 'text', name: 'previous_value', nullable: true })
	previousValue: string | null;

	@Column({ type: 'text', name: 'next_value', nullable: true })
	nextValue: string | null;
}
