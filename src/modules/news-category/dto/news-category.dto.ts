import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderNewsCategory } from '../enum/news-category.enum';

export class CreateNewsCategoryDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameVi: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameEn: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	descriptionVi?: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	descriptionEn?: string;

	@IsInt()
	@IsOptional()
	@Min(0)
	order?: number;
}

export class UpdateNewsCategoryDto extends PartialType(CreateNewsCategoryDto) {
	@IsUUID()
	@IsOptional()
	id?: string;

	@IsInt()
	@IsNotEmpty()
	@Min(0)
	order: number;
}

export class BulkUpdateNewsCategory {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => UpdateNewsCategoryDto)
	newsCategories: UpdateNewsCategoryDto[];
}

export class QueryGetListNewsCategoryDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderNewsCategory)
	fieldOrder: FieldOrderNewsCategory = FieldOrderNewsCategory.ORDER;
}
