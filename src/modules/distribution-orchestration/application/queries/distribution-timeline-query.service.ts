import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
	TimelineEventDto,
	TimelineResultDto,
	decodeCursor,
	encodeCursor,
} from './distribution-timeline.query';

const DEFAULT_LIMIT = 50;

interface TimelineQueryInput {
	distributionId: string;
	/** undefined = trả all; 'milestone' | 'progress' = filter */
	level?: string;
	cursor?: string;
	limit?: number;
}

/**
 * Read-side query service cho timeline distribution_event.
 * Dùng raw SQL + keyset cursor pagination — không dùng repository để tránh ORM overhead
 * và tận dụng index (distribution_id, id) tối ưu.
 */
@Injectable()
export class DistributionTimelineQueryService {
	constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

	async getTimeline(input: TimelineQueryInput): Promise<TimelineResultDto> {
		const limit = Math.min(input.limit ?? DEFAULT_LIMIT, 200);
		const cursorId = input.cursor ? decodeCursor(input.cursor) : '0';

		const rows: Array<Record<string, unknown>> =
			await this.dataSource.query(
				`SELECT id, type, channel_id, level, payload, occurred_at
			 FROM   distribution_event
			 WHERE  distribution_id = $1
			   AND  ($2::varchar IS NULL OR level = $2)
			   AND  id > $3
			 ORDER  BY id ASC
			 LIMIT  $4`,
				[input.distributionId, input.level ?? null, cursorId, limit],
			);

		const items: TimelineEventDto[] = rows.map((r) => ({
			id: String(r.id),
			type: r.type as string,
			channelId: (r.channel_id as string | null) ?? null,
			level: r.level as 'milestone' | 'progress',
			payload: (typeof r.payload === 'string'
				? JSON.parse(r.payload)
				: r.payload) as Record<string, unknown>,
			occurredAt: new Date(r.occurred_at as string),
		}));

		const nextCursor =
			items.length === limit
				? encodeCursor(items[items.length - 1].id)
				: null;

		return { items, nextCursor };
	}
}
