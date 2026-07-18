import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class TriggerSpotifyExportDto {
	@ApiPropertyOptional({
		description:
			'Bỏ qua logic skip trên ag-release-tool-export (tải lại + ghi đè R2 mọi folder, kể cả đã thành công trước đó).',
		default: false,
	})
	@IsOptional()
	@IsBoolean()
	force?: boolean;
}
