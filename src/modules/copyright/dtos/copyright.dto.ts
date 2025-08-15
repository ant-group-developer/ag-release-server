import { Type } from 'class-transformer';
import {
	IsArray,
	IsDate,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { ScanStatus } from '../enums/copyright.enum';

// task
class TrackScanTaskDto {
	@IsDate()
	@IsOptional()
	@Type(() => Date)
	trackCreatedAtStart?: Date | null;

	@IsDate()
	@IsOptional()
	@Type(() => Date)
	trackCreatedAtEnd?: Date | null;

	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	@IsNotEmpty({ each: true })
	releaseIds: string[] | null[];

	@IsOptional()
	@IsArray()
	@Length(10, 10, { each: true })
	@IsNotEmpty({ each: true })
	trackIds: string[] | null[];

	@IsOptional()
	ignoreTrackScanned: boolean = true;
}

export class CreateTrackScanStatusDto {
	@ValidateNested()
	@Type(() => TrackScanTaskDto)
	filter: TrackScanTaskDto;
}

export class QueryGetListTask extends BaseQueryDto {
	@IsEnum(ScanStatus)
	@IsOptional()
	status?: ScanStatus;

	@IsString()
	fieldOrder: string = 'createdAt';
}

// result
export class ScanTrackDto {
	@IsString()
	trackId: string;
}

export class QueryGetListResultScan extends BaseQueryDto {
	fieldOrder: string = 'createdAt';
}
