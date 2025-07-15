import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTrackOriginType } from '../enum/track-origin-type.enum';

export class CreateTrackOriginTypeDto {
	@IsString()
	@MaxLength(100)
	name: string;
}

export class UpdateTrackOriginTypeDto extends PartialType(
	CreateTrackOriginTypeDto,
) {
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListTrackOriginTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackOriginType)
	fieldOrder: FieldOrderTrackOriginType = FieldOrderTrackOriginType.NAME;
}
