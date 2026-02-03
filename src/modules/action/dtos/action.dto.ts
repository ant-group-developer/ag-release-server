import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderAction } from '../enums/action.enum';

export class CreateActionDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	note?: string;
}

export class UpdateActionDto extends PartialType(CreateActionDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@ValidateIf((_, value) => value !== undefined)
	code: string;
}

export class QueryGetListActionDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderAction)
	fieldOrder: FieldOrderAction = FieldOrderAction.NAME;
}
