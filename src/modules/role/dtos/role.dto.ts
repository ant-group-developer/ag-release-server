import {
	IsArray,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateRoleDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	color: string;

	@IsString()
	@IsOptional()
	@MaxLength(1000)
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
	@MaxLength(50)
	name?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	color?: string;

	@IsString()
	@IsOptional()
	@MaxLength(1000)
	note?: string;

	@IsArray()
	@IsNotEmpty()
	@IsUUID('4', { each: true })
	permissionIds: string[];
}

// query
export class GetListRole extends BaseQueryDto {}

// delete
export class BulkDeleteRoleDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
