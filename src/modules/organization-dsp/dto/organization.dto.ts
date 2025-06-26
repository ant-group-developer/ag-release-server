import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateOrganizationDspDto {
	@IsUUID()
	@IsNotEmpty()
	dspId: string;

	@IsUUID()
	@IsNotEmpty()
	organizationId: string;
}

export class UpdateOrganizationDspDto extends PartialType(
	CreateOrganizationDspDto,
) {}

export class QueryGetListOrganizationDspDto extends BaseQueryDto {}
