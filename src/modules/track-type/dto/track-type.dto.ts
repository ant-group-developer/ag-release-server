import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTrackType } from '../enum/track-type.enum';

export class CreateTrackTypeDto {
	@IsString()
	@MaxLength(100)
	name: string;
}

export class UpdateTrackTypeDto extends PartialType(CreateTrackTypeDto) {
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListTrackTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackType)
	fieldOrder: FieldOrderTrackType = FieldOrderTrackType.NAME;
}
