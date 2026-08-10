import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
} from 'class-validator';
import { IsValidName } from 'src/common/decorators/common.decorator-validate';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { ChannelStatus } from '../enum/channel.enum';

export class CreateChannelDto {
	@ApiProperty({
		maxLength: 20,
		example: 'ArtistNameVEVO',
		description:
			'Alphanumeric Vevo channel name, at most 20 characters and ending in VEVO.',
	})
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsValidName(2)
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
	@MaxLength(500)
	thumbUrl?: string;

	@ApiPropertyOptional({
		example: true,
		description:
			'Trạng thái hoạt động của kênh (true: active, false: inactive)',
	})
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional({
		example: false,
		description:
			'Set true when the channel already exists in Vevo Backstage. The server will only create the local DB record and will not call Vevo.',
	})
	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	existedOnVevoBackstage?: boolean;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}

export class QueryGetListChannelDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	fieldOrder: string = 'channel.name';

	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@IsOptional()
	@IsEnum(ChannelStatus)
	status?: ChannelStatus;

	@IsOptional()
	@Transform(({ value }) => value === true || value === 'true')
	@IsBoolean()
	isActive?: boolean;

	onlyActorTenant?: boolean;
}

export class AssignUsersToChannelDto {
	@ApiProperty({
		description:
			'Danh sách ID của các user thuộc workspace được gán vào kênh',
		type: [String],
		example: ['d290f1ee-6c54-4b01-90e6-d701748f0851'],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsUUID('all', { each: true })
	userIds: string[];
}
