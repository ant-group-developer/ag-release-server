import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * RetryDistributionDto — body của POST /distributions/:id/retry.
 *
 * `channelIds` = nhánh ISSUES muốn reset. Bỏ trống → reset TẤT CẢ channel ISSUES (spec).
 * `idempotencyKey` optional — chống double-retry.
 */
export class RetryDistributionDto {
	@ApiPropertyOptional({
		type: [String],
		format: 'uuid',
		description: 'Channel ISSUES cần reset. Bỏ trống = reset mọi channel ISSUES.',
	})
	@IsOptional()
	@IsArray()
	@IsUUID('all', { each: true })
	channelIds?: string[];

	@ApiPropertyOptional({
		description: 'Idempotency key client cấp — chống double-retry.',
	})
	@IsOptional()
	@IsString()
	idempotencyKey?: string;
}
