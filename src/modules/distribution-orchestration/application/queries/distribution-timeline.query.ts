import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Loại level filter. Server quyết định default theo role — client không tự truyền. */
export type EventLevel = 'milestone' | 'progress';

export class TimelineQueryDto {
	@ApiPropertyOptional({
		description: 'Cursor từ response trước (nextCursor)',
	})
	@IsOptional()
	@IsString()
	cursor?: string;

	@ApiPropertyOptional({
		description: 'Số event mỗi trang (default 50, max 200)',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(200)
	@Type(() => Number)
	limit?: number;
}

export interface TimelineEventDto {
	id: string;
	type: string;
	channelId: string | null;
	level: EventLevel;
	payload: Record<string, unknown>;
	occurredAt: Date;
}

export interface TimelineResultDto {
	items: TimelineEventDto[];
	/** null khi không còn trang tiếp theo */
	nextCursor: string | null;
}

/** Encode bigint id string → base64 cursor an toàn cho URL. */
export function encodeCursor(id: string): string {
	return Buffer.from(id, 'utf8').toString('base64url');
}

/** Decode cursor → bigint id string. Invalid input → '0' (từ đầu). */
export function decodeCursor(cursor: string): string {
	try {
		const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
		// Validate: phải là chuỗi số nguyên dương
		if (/^\d+$/.test(decoded)) return decoded;
	} catch {}
	return '0';
}
