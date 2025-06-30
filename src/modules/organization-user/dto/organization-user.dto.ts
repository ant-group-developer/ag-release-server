import { PartialType } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateOrganizationUserDto {
	@IsUUID()
	userId: string;

	@IsUUID()
	organizationId: string;
}

export class UpdateOrganizationUserDto extends PartialType(
	CreateOrganizationUserDto,
) {}

export class QueryGetListOrganizationUserDto extends BaseQueryDto {}
