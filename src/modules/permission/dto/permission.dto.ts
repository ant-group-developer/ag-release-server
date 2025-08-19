import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderPermission } from '../enums/permission.enum';
import { DEFAULT_LENGTH_CODE, DEFAULT_LENGTH_NAME, DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';

export class CreatePermissionDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;

	@IsString()
	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	note?: string;
}

export class BulkCreatePermissionDto {
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreatePermissionDto)
	permissions: CreatePermissionDto[];
}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;
}

export class QueryGetListPermissionDto extends BaseQueryDto {
	fieldOrder: FieldOrderPermission = FieldOrderPermission.NAME;
}

export class BulkDeletePermissionDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
