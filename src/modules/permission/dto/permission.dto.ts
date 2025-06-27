import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreatePermissionDto {
	@IsString()
	@IsNotEmpty()
	name: string;

	@IsString()
	@IsNotEmpty()
	value: string;
}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}

export class QueryGetListPermissionDto extends BaseQueryDto {}
