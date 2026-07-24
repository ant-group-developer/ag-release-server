import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';

/**
 * TicketIssueItemDto — 1 flag lỗi reviewer tạo (khớp TicketIssueItem VO).
 *
 * Reviewer nhập danh sách item khi reject → ghi vào orchestration_ticket.metadata.items[]
 * để user thấy chung với lỗi CI/QA/Spotify (cùng 1 shape, client render 1 component).
 */
export class TicketIssueItemDto {
	@ApiPropertyOptional({ description: 'Mã lỗi máy đọc (vd "AUD001").' })
	@IsString()
	@MaxLength(60)
	code!: string;

	@ApiPropertyOptional({ description: 'Mô tả cho người đọc.' })
	@IsString()
	@MaxLength(500)
	message!: string;

	@ApiPropertyOptional({
		description: "'error' chặn phát hành, 'warning' chỉ cảnh báo.",
		enum: ['error', 'warning'],
	})
	@IsIn(['error', 'warning'])
	severity!: 'error' | 'warning';

	@ApiPropertyOptional({ description: 'Vị trí lỗi (vd "Track 3").' })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	location?: string;

	@ApiPropertyOptional({ description: 'Gợi ý sửa cho user.' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	suggestion?: string;
}

/**
 * ReviewDecisionDto — body của POST /distributions/:id/review/reject (approve không cần body).
 *
 * `note` = lý do reject tóm tắt (đi vào review row audit + detail ticket).
 * `items` = danh sách flag lỗi cấu trúc reviewer tạo (ghi vào ticket.metadata.items[]).
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
		type: [TicketIssueItemDto],
		description: 'Danh sách flag lỗi reviewer tạo (hiển thị cho user sửa).',
	})
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => TicketIssueItemDto)
	items?: TicketIssueItemDto[];

	@ApiPropertyOptional({
		description: 'Idempotency key client cấp — chống double-decision.',
	})
	@IsOptional()
	@IsString()
	idempotencyKey?: string;
}
