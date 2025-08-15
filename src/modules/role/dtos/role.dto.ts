import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
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

class RolePermissionDto {
	@IsUUID()
	@IsNotEmpty()
	permissionId: string;
}

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

	@IsArray()
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => RolePermissionDto)
	@Transform(({ value }) => (value == null ? [] : value))
	rolePermissions: RolePermissionDto[] | [];
}

// update
class UpdateRolePermissionDto {
	@IsUUID()
	@IsOptional()
	id?: string;

	@IsUUID()
	@IsNotEmpty()
	permissionId: string;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
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

	@IsArray()
	@ArrayMaxSize(10)
	@ValidateNested({ each: true })
	@Type(() => UpdateRolePermissionDto)
	@Transform(({ value }) => (value == null ? [] : value))
	rolePermissions: UpdateRolePermissionDto[];
}

// query
export class GetListRole extends BaseQueryDto {}

// delete
export class BulkDeleteRoleDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
