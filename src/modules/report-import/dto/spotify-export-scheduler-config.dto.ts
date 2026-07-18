import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSpotifyExportSchedulerConfigDto {
	@ApiPropertyOptional({
		description:
			'Bật/tắt auto-export scheduler (tự động gọi CI tool theo cron)',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@ApiPropertyOptional({
		description: 'Cron expression cho auto-export (giờ Asia/Ho_Chi_Minh)',
		example: '0 3 * * *',
	})
	@IsOptional()
	@IsString()
	cron?: string;

	@ApiPropertyOptional({
		description:
			'Truyền force=true sang CI tool để buộc re-download dù đã có cache',
		example: false,
	})
	@IsOptional()
	@IsBoolean()
	force?: boolean;
}
