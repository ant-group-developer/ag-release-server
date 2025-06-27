import { PartialType } from '@nestjs/swagger';
import { IsEmail, IsString, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateOrganizationDto {
	@IsString()
	logo: string;

	@IsString()
	icon: string;

	@IsString()
	name: string;

	@IsString()
	title: string;

	@IsString()
	domain: string;

	@IsEmail()
	email: string;

	@IsString()
	primaryColor: string;

	@IsUUID()
	ownerId: string;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class QueryGetListOrganizationDto extends BaseQueryDto {}
