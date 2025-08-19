import {
	IsArray,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { DEFAULT_LENGTH_CODE, DEFAULT_LENGTH_NAME, DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateRoleDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	color: string;

	@IsString()
	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	note?: string;

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
	@MaxLength(10)
	color?: string;

	@IsString()
	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	note?: string;

	@IsArray()
	@IsNotEmpty()
	@IsUUID('4', { each: true })
	permissionIds: string[];
}

// query
export class GetListRole extends BaseQueryDto { }

// delete
export class BulkDeleteRoleDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
