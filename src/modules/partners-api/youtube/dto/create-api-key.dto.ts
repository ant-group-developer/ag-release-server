import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { GOOGLE_API_KEY_REGEX } from '../constants/youtube.constants';

export class CreateYoutubeApiKeyDto {
	@ApiProperty({
		description: 'Friendly name cho key (unique)',
		example: 'primary-key-01',
	})
	@IsString()
	@MinLength(1)
	@MaxLength(100)
	alias: string;

	@ApiProperty({
		description: 'Google/YouTube Data API v3 key (plaintext, se duoc encrypt truoc khi luu)',
		example: 'AIzaSyAcqaXZiKrlZXKVLeZS6wHPSydHJztryHY',
	})
	@IsString()
	@Matches(GOOGLE_API_KEY_REGEX, {
		message: 'apiKey khong dung dinh dang Google API key (AIza...)',
	})
	apiKey: string;

	@ApiPropertyOptional({
		description: 'Quota limit daily (mac dinh 10000)',
		example: 10000,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	dailyQuotaLimit?: number;
}
