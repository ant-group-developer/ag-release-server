import { Type } from 'class-transformer';
import {
	IsArray,
	IsDate,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

class TrackScanFilterDto {
	@IsDate()
	@IsOptional()
	@Type(() => Date)
	trackCreatedAtStart?: Date;

	@IsDate()
	@IsOptional()
	@Type(() => Date)
	trackCreatedAtEnd?: Date;

	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	@IsNotEmpty({ each: true })
	releaseIds: string[];

	@IsOptional()
	@IsArray()
	@Length(10, 10, { each: true })
	@IsNotEmpty({ each: true })
	trackIds: string[];

	@IsOptional()
	ignoreTrackScanned: boolean = true;
}

export class CreateTrackScanStatusDto {
	@ValidateNested()
	@Type(() => TrackScanFilterDto)
	filter: TrackScanFilterDto;
}

//
export class ScanTrackDto {
	@IsString()
	trackId: string;
}

export class QueryGetListResultScan extends BaseQueryDto {
	fieldOrder: string = 'createdAt';
}
