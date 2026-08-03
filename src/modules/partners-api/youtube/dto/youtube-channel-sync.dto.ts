import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class SyncYoutubeChannelsDto {
	@ApiPropertyOptional({
		default: false,
		description:
			'false: chi fill field DB dang NULL. true: ghi de gia tri khac tu YouTube.',
	})
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	force = false;
}

export class QueryYoutubeChannelSyncLogsDto extends BaseQueryDto {
	@IsOptional()
	@IsUUID('4')
	channelId?: string;
}
