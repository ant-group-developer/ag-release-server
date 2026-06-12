import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	Matches,
	MaxLength,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateChannelDto {
	@ApiProperty({
		maxLength: 20,
		example: 'ArtistNameVEVO',
		description:
			'Alphanumeric Vevo channel name, at most 20 characters and ending in VEVO.',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(20)
	@Matches(/^[A-Za-z0-9]+VEVO$/, {
		message:
			'name must contain only alphanumeric characters and end with VEVO',
	})
	name: string;

	@ApiProperty({
		format: 'uuid',
		description: 'Tenant that owns the channel',
	})
	@IsUUID('4')
	tenantId: string;

	@ApiPropertyOptional({
		example: 'UCabcdefghijklmnopqrstuvw',
		description: 'YouTube channel ID',
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
	youtubeChannelId?: string;

	@ApiPropertyOptional({
		example: 'https://storage.googleapis.com/bucket/channel-thumb.jpg',
		description: 'Public thumbnail URL',
	})
	@IsOptional()
	@IsUrl()
	@MaxLength(500)
	thumbUrl?: string;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}

export class QueryGetListChannelDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	fieldOrder: string = 'name';

	tenantId?: string;
}
