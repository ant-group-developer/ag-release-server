import {
	IsArray,
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_COLOR,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateRoleDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_COLOR)
	color: string;

	@IsString()
	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	note?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@IsNotEmpty()
	@IsArray()
	@IsUUID('4', { each: true })
	permissionIds: string[];
}

// update
export class UpdateRoleDto {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_COLOR)
	color?: string;

	@IsString()
	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	note?: string;

	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ValidateIf((_, value) => value !== undefined)
	@IsArray()
	@IsOptional()
	@IsUUID('4', { each: true })
	permissionIds?: string[];
}

// query
export class GetListRole extends BaseQueryDto {
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;
}

// delete
export class BulkDeleteRoleDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
