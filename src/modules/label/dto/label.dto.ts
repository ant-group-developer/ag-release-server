import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateLabelDto {
	@ApiProperty({
		description: 'The name of the label',
		maxLength: 100,
		example: 'Warner Music',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	@ApiProperty({
		description: 'URL of the label’s logo or picture',
		maxLength: 100,
		example:
			'https://storage.googleapis.com/ant-music-assets/label/warner.jpg',
		required: false,
	})
	@IsString()
	@IsOptional()
	@MaxLength(100)
	picture?: string;

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
	description?: string;
}
export class UpdateLabelDto extends PartialType(CreateLabelDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListLabelDto extends BaseQueryDto {}
