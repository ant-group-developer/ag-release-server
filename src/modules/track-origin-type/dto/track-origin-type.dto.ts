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
import { FieldOrderTrackOriginType } from '../enum/track-origin-type.enum';

export class CreateTrackOriginTypeDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(50)
	code: string;
}

export class UpdateTrackOriginTypeDto extends PartialType(
	CreateTrackOriginTypeDto,
) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(50)
	code: string;
}

export class QueryGetListTrackOriginTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackOriginType)
	fieldOrder: FieldOrderTrackOriginType = FieldOrderTrackOriginType.NAME;
}
