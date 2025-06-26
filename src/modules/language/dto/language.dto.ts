import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateLanguageDto {
	@IsString()
	@IsNotEmpty()
	name: string;

	@IsString()
	@IsNotEmpty()
	code: string;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {}

export class QueryGetListLanguageDto extends BaseQueryDto {}
