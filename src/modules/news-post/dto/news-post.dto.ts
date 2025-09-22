import { PartialType } from '@nestjs/swagger';
import {
	IsArray,
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
import { FieldOrderNewsPost, NewsPostStatus } from '../enum/news-post.enum';

export class CreateNewsPostDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	titleVi: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	titleEn: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	descriptionVi?: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	descriptionEn?: string;

	@IsString()
	@IsNotEmpty()
	contentVi: string;

	@IsString()
	@IsNotEmpty()
	contentEn: string;

	@IsUUID()
	@IsOptional()
	thumbnailId?: string;

	@IsEnum(NewsPostStatus)
	@IsOptional()
	status?: NewsPostStatus;

	@IsUUID()
	@IsNotEmpty()
	newsCategoryId: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	slug: string;

	@IsArray()
	@IsString({ each: true })
	@IsOptional()
	keywords?: string[];
}

export class UpdateNewsPostDto extends PartialType(CreateNewsPostDto) {}

export class QueryGetListNewsPostDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(NewsPostStatus)
	status?: NewsPostStatus;

	@IsUUID()
	@IsOptional()
	newsCategoryId?: string;

	@IsOptional()
	@IsEnum(FieldOrderNewsPost)
	fieldOrder: FieldOrderNewsPost = FieldOrderNewsPost.CREATED_AT;
}
