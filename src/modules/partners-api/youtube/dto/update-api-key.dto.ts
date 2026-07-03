import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { YoutubeApiKeyStatus } from '../enum/youtube.enum';

export class UpdateYoutubeApiKeyDto {
	@ApiPropertyOptional({
		description: 'Doi ten friendly cua key',
	})
	@IsOptional()
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	alias?: string;

	@ApiPropertyOptional({
		description: 'Chi cho phep active hoac disabled (khac 2 gia tri kia bi ignore)',
		enum: [YoutubeApiKeyStatus.ACTIVE, YoutubeApiKeyStatus.DISABLED],
	})
	@IsOptional()
	@IsEnum([YoutubeApiKeyStatus.ACTIVE, YoutubeApiKeyStatus.DISABLED])
	status?: YoutubeApiKeyStatus.ACTIVE | YoutubeApiKeyStatus.DISABLED;

	@ApiPropertyOptional({
		description: 'Doi quota limit daily',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	dailyQuotaLimit?: number;
}
