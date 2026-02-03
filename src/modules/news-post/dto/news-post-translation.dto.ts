import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { FieldOrderNewsPostTranslation } from '../enum/news-post-translation.enum';

export class CreateNewsPostTranslationDto {
	@IsUUID()
	@IsNotEmpty()
	newsPostId: string;

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

export class UpdateNewsPostTranslationDto {
	@IsOptional()
	@IsString()
	languageCode?: string;

	@IsOptional()
	@IsString()
	title?: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsOptional()
	@IsString()
	content?: string;

	@IsOptional()
	@IsBoolean()
	isDefault?: boolean;

	userId: string;
}

export class GetListNewsPostTranslations extends BaseQueryDto {
	@IsOptional()
	@IsBoolean()
	@Type(() => Boolean)
	isDefault?: boolean;

	@IsUUID()
	@IsOptional()
	newsPostId?: string;

	@IsEnum(FieldOrderNewsPostTranslation)
	@IsOptional()
	fieldOrder: FieldOrderNewsPostTranslation =
		FieldOrderNewsPostTranslation.CREATED_AT;

	@IsEnum(OrderDirection)
	@IsOptional()
	orderBy: OrderDirection = OrderDirection.ASC;
}
