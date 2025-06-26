import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateLabelDto {
	@IsString()
	name: string;

	@IsOptional()
	@IsString()
	picture: string | null;

	@IsOptional()
	@IsString()
	description: string | null;
}

export class UpdateLabelDto extends PartialType(CreateLabelDto) {}

export class QueryGetListLabelDto extends BaseQueryDto {}
