import { IsOptional, IsString, IsBoolean, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSpotifyR2SyncConfigDto {
  @ApiPropertyOptional({
    description: 'Bật/tắt auto-sync Spotify report zip từ R2',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Cron expression cho auto-sync (giờ Asia/Ho_Chi_Minh)',
    example: '0 4 * * *',
  })
  @IsOptional()
  @IsString()
  cron?: string;

  @ApiPropertyOptional({
    description: 'Prefix trên R2 chứa các file zip report Spotify cần quét',
    example: 'spotify-reports/',
  })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({
    description:
      'Số ngày giữ zip trong {prefix}processed/ trước khi tự xoá khỏi R2 (chạy cùng cron hàng ngày). 0 = không tự xoá.',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  retentionDays?: number;
}
