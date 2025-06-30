import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { maxLengthPicture } from 'src/modules/database/constants/database.constant';

export class CreateLabelDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	name: string;

	@IsOptional()
	@IsString()
	@MaxLength(maxLengthPicture)
	picture: string | null;

	@IsOptional()
	@IsString()
	@MaxLength(200)
	description: string | null;
}

export class UpdateLabelDto extends PartialType(CreateLabelDto) {}

export class QueryGetListLabelDto extends BaseQueryDto {}
