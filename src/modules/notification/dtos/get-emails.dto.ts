import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class GetEmailsDto {
	@ApiPropertyOptional({
		description: 'Số lượng email muốn lấy',
		example: 10,
	})
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	limit?: number;

	@ApiPropertyOptional({
		description: 'Lấy email từ thời điểm này',
		example: '2026-05-01T00:00:00Z',
	})
	@IsOptional()
	@IsString()
	since?: string;

	@ApiPropertyOptional({
		description: 'Lấy email đến thời điểm này',
		example: '2026-05-14T23:59:59Z',
	})
	@IsOptional()
	@IsString()
	until?: string;

	@ApiPropertyOptional({
		description: 'Trạng thái email',
		example: 'delivered',
	})
	@IsOptional()
	@IsString()
	status?: string;

	@ApiPropertyOptional({
		description: 'ID campaign',
		example: 'cmp_123456',
	})
	@IsOptional()
	@IsString()
	campaign_id?: string;
}
