import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderLabel } from '../enum/label.enum';

export class CreateLabelDto {
	@ApiProperty({
		description: 'The name of the label',
		maxLength: 100,
		example: 'Warner Music',
	})
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@IsNotEmpty()
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@Matches(/^[^_]+$/, {
		message: 'Name must not contain underscore (_)',
	})
	name: string;

	@ApiProperty({
		description: 'URL of the label’s logo or picture',
		maxLength: LENGTH_PICTURE,
		example:
			'https://storage.googleapis.com/ant-music-assets/label/warner.jpg',
		required: false,
	})
	@IsString()
	@IsOptional()
	@MaxLength(LENGTH_PICTURE)
	picture?: string | null;

	@ApiProperty({
		description: 'A short description of the label',
		maxLength: 200,
		example:
			'Warner Music is one of the biggest record labels in the world.',
		required: false,
	})
	@IsString()
	@IsOptional()
	@MaxLength(200)
	description?: string | null;
}

export class UpdateLabelDto extends PartialType(CreateLabelDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListLabelDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderLabel)
	fieldOrder: FieldOrderLabel = FieldOrderLabel.NAME;
}
