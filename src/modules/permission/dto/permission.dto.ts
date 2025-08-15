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

export class CreatePermissionDto {
	@IsString()
	@MaxLength(50)
	@IsNotEmpty()
	name: string;

	@IsString()
	@MaxLength(50)
	@IsNotEmpty()
	value: string;

	@IsString()
	@IsOptional()
	@MaxLength(1000)
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
	@MaxLength(50)
	@IsNotEmpty()
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(50)
	@IsNotEmpty()
	value: string;
}

export class QueryGetListPermissionDto extends BaseQueryDto {
	fieldOrder: FieldOrderPermission = FieldOrderPermission.NAME;
}

export class BulkDeletePermissionDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
