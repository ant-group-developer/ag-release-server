import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import {
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderNewsPost, NewsPostStatus } from '../enum/news-post.enum';

export class CreateNewsPostDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	title: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	description?: string;

	@IsString()
	@IsNotEmpty()
	content: string;

	@MaxLength(LENGTH_PICTURE)
	@IsOptional()
	thumbnail?: string;

	@IsEnum(NewsPostStatus)
	@IsOptional()
	status?: NewsPostStatus;

	@IsUUID()
	@IsNotEmpty()
	newsCategoryId: string;

	@IsString()
	@IsNotEmpty()
	languageCode: string;

	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) =>
		value === null || value === undefined ? [] : value,
	)
	@IsOptional()
	keywords?: string[] = [];
}

export class UpdateNewsPostDto extends PartialType(CreateNewsPostDto) {}

export class AddTranslationNewsPostDto {
	@IsNotEmpty()
	@IsString()
	languageCode: string;

	@IsNotEmpty()
	@IsString()
	title: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsNotEmpty()
	@IsString()
	content: string;

	@IsOptional()
	@IsBoolean()
	isDefault: boolean = false;

	userId: string;
}

export class UpdateTranslation extends PartialType(AddTranslationNewsPostDto) {
	@IsNotEmpty()
	id: string;
}

export class QueryGetListNewsPostDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	title?: string;

	@IsOptional()
	@Transform(({ value }) =>
		value
			.split(',')
			.map((v: string) => v.trim())
			.filter(Boolean),
	)
	@IsArray()
	keywords?: string[];

	@IsOptional()
	@IsEnum(NewsPostStatus)
	status?: NewsPostStatus;

	@IsUUID()
	@IsOptional()
	newsCategoryId?: string;

	@IsOptional()
	@IsEnum(FieldOrderNewsPost)
	fieldOrder: FieldOrderNewsPost = FieldOrderNewsPost.CREATED_AT;

	@IsOptional()
	@IsString()
	languageCode?: string;

	// locale: string;
}
