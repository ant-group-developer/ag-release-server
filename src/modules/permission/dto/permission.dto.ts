import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderPermission } from '../enums/permission.enum';

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

	@IsOptional()
	isActive?: boolean;
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

	@ValidateIf((_, value) => value !== undefined)
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

export class QueryGetListPermissionDto extends BaseQueryDto {
	fieldOrder: FieldOrderPermission = FieldOrderPermission.NAME;

	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	isActive?: boolean;
}

export class BulkDeletePermissionDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
