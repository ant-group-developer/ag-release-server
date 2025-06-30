import { PartialType } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateUserPermissionDto {
	@IsUUID()
	userId: string;

	@IsUUID()
	permissionId: string;
}

export class UpdateUserPermissionDto extends PartialType(
	CreateUserPermissionDto,
) {}

export class QueryGetListUserPermissionDto extends BaseQueryDto {}
