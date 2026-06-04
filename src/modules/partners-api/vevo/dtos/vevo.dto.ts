import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	Matches,
	MaxLength,
} from 'class-validator';

export class CreateVevoChannelDto {
	@ApiProperty({
		example: 'ArtistNameVEVO',
		description:
			'Alphanumeric Vevo channel name, at most 20 characters and ending in VEVO.',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(20)
	@Matches(/^[A-Za-z0-9]+VEVO$/, {
		message:
			'channelName must contain only alphanumeric characters and end with VEVO',
	})
	channelName: string;

	@ApiPropertyOptional({
		example: 'https://contentpartner.com/channels/vevo/callback',
		description:
			'Whitelisted callback URL. Uses the configured Vevo callback URL when omitted.',
	})
	@IsOptional()
	@IsUrl({ require_tld: false })
	callbackUrl?: string;
}

export class VevoChannelCallbackDto {
	@ApiProperty({ example: 'ArtistNameVEVO' })
	@IsString()
	@IsNotEmpty()
	channel_name: string;

	@ApiProperty({ example: 'UCabcdefghijklmnopqrstuvw' })
	@IsString()
	@IsNotEmpty()
	youtube_channel_id: string;
}
