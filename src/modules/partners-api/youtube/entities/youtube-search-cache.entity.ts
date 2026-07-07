import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { YoutubeLookupKind, YoutubeMatchStatus } from '../enum/youtube.enum';

@Entity('youtube_search_cache', {
	comment: 'Cache ket qua goi YouTube API de tranh burn quota',
})
@Index('IDX_youtube_search_cache_expires_at', ['expiresAt'])
export class YoutubeSearchCache extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: 64,
		name: 'query_hash',
		unique: true,
		comment: 'sha256 cua normalized query (kind:input)',
	})
	queryHash: string;

	@Column({
		type: 'text',
		name: 'query_text',
	})
	queryText: string;

	@Column({
		type: 'varchar',
		length: 20,
		name: 'lookup_kind',
		comment: 'by_id (goi videos.list) | search (goi search.list)',
	})
	lookupKind: YoutubeLookupKind;

	@Column({
		type: 'varchar',
		length: 20,
		name: 'youtube_video_id',
		nullable: true,
	})
	youtubeVideoId: string | null;

	@Column({
		type: 'varchar',
		length: 100,
		name: 'youtube_channel_id',
		nullable: true,
	})
	youtubeChannelId: string | null;

	@Column({
		type: 'varchar',
		length: 255,
		name: 'youtube_channel_title',
		nullable: true,
	})
	youtubeChannelTitle: string | null;

	@Column({
		type: 'uuid',
		name: 'matched_channel_id',
		nullable: true,
		comment:
			'UUID cua channels Postgres neu tim thay match, NULL neu chua co',
	})
	matchedChannelId: string | null;

	@ManyToOne(() => Channel, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'matched_channel_id' })
	matchedChannel: Channel | null;

	@Column({
		type: 'varchar',
		length: 20,
		name: 'match_status',
		comment: 'matched | no_match | no_data',
	})
	matchStatus: YoutubeMatchStatus;

	@Column({
		type: 'jsonb',
		name: 'raw_response',
		nullable: true,
		comment: 'Top 3 items tra ve tu YouTube search (json) de admin trace',
	})
	rawResponse: unknown | null;

	@Column({
		type: 'timestamptz',
		name: 'cached_at',
		default: () => 'now()',
	})
	cachedAt: Date;

	@Column({
		type: 'timestamptz',
		name: 'expires_at',
	})
	expiresAt: Date;
}
