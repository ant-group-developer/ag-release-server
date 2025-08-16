import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTrackType } from '../enum/track-type.enum';

export class CreateTrackTypeDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(50)
	code: string;
}

export class UpdateTrackTypeDto extends PartialType(CreateTrackTypeDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(50)
	code: string;
}

export class QueryGetListTrackTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackType)
	fieldOrder: FieldOrderTrackType = FieldOrderTrackType.NAME;
}
