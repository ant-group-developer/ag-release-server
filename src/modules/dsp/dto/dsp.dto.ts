import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { lengthPicture } from 'src/modules/database/constants/database.constant';
import { FieldOrderDsp } from '../enum/dsp.enum';

export class CreateDspDto {
	@ApiProperty({
		description: 'Name of the DSP (Digital Service Provider)',
		maxLength: 100,
		example: 'Spotify',
	})
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'Picture URL of the DSP',
		maxLength: lengthPicture,
		required: false,
		type: 'string',
		example: 'http://example.com/logo.jpg',
	})
	@IsOptional()
	@IsString()
	@MaxLength(lengthPicture)
	picture: string | null;

	@ApiProperty({
		description: 'Indicates whether the DSP can link to artist profiles',
		type: 'boolean',
		example: true,
	})
	@IsBoolean()
	canLinkArtistProfile: boolean;
}

export class UpdateDspDto extends PartialType(CreateDspDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;
}

export class QueryGetListDspDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderDsp)
	fieldOrder: FieldOrderDsp = FieldOrderDsp.NAME;
}
