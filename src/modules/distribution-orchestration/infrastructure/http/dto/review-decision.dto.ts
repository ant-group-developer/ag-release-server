import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * ReviewDecisionDto — body của POST /distributions/:id/review/reject (approve không cần body).
 *
 * `note` = lý do reject reviewer nhập (đi vào ticket REVIEW_REJECT + review row audit).
 * `idempotencyKey` optional client cấp — chống double-submit quyết định.
 */
export class ReviewDecisionDto {
	@ApiPropertyOptional({
		description: 'Lý do reject (hiển thị cho user sửa)',
		maxLength: 2000,
	})
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	note?: string;

	@ApiPropertyOptional({
		description: 'Idempotency key client cấp — chống double-decision.',
	})
	@IsOptional()
	@IsString()
	idempotencyKey?: string;
}
