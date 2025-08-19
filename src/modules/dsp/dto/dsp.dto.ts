import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderDsp } from '../enum/dsp.enum';

class CreateDspActionDto {
	@IsUUID()
	@IsNotEmpty()
	actionId: string;

	@IsBoolean()
	@IsOptional()
	isDefault: boolean = false;
}

export class CreateDspDto {
	@ApiProperty({
		description: 'Name of the DSP (Digital Service Provider)',
		maxLength: DEFAULT_LENGTH_NAME,
		example: 'Spotify',
	})
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'Picture URL of the DSP',
		maxLength: LENGTH_PICTURE,
		required: false,
		type: 'string',
		example: 'http://example.com/logo.jpg',
	})
	@IsOptional()
	@IsString()
	@MaxLength(LENGTH_PICTURE)
	picture: string | null;

	@ApiProperty({
		description: 'Indicates whether the DSP can link to artist profiles',
		type: 'boolean',
		example: true,
	})
	@IsBoolean()
	canLinkArtistProfile: boolean;

	@IsNotEmpty()
	@IsNotEmpty({ each: true })
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	@MaxLength(100, { each: true })
	formatLinks: string[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateDspActionDto)
	dspActions?: CreateDspActionDto[];
}

class UpdateDspActionDto {
	@IsUUID()
	@IsOptional()
	id?: string;

	@IsUUID()
	@IsNotEmpty()
	actionId: string;

	@IsBoolean()
	@IsOptional()
	isDefault: boolean = false;
}

export class UpdateDspDto extends PartialType(CreateDspDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsNotEmpty({ each: true })
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	@MaxLength(100, { each: true })
	formatLinks?: string[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateDspActionDto)
	dspActions?: UpdateDspActionDto[];
}

export class QueryGetListDspDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderDsp)
	fieldOrder: FieldOrderDsp = FieldOrderDsp.NAME;
}
