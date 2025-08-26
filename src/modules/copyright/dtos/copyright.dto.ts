import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsDate,
	IsEnum,
	IsNotEmpty,
	IsNumber,
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
	@IsOptional()
	@Transform(({ value }) => (value === undefined ? null : new Date(value)))
	@IsDate()
	trackCreatedAtStart: Date | null;

	@IsOptional()
	@Transform(({ value }) => (value === undefined ? null : new Date(value)))
	@IsDate()
	trackCreatedAtEnd: Date | null;

	@IsOptional()
	@Transform(({ value }) => (value === undefined ? null : value))
	@IsArray()
	@IsUUID('4', { each: true })
	@IsNotEmpty({ each: true })
	releaseIds: string[] | null;

	@IsOptional()
	@Transform(({ value }) => (value === undefined ? null : value))
	@IsArray()
	@Length(10, 10, { each: true })
	@IsNotEmpty({ each: true })
	trackIds: string[] | null;

	@IsOptional()
	@Transform(({ value }) => (value === undefined ? true : value))
	@IsBoolean()
	ignoreTrackScanned: boolean;
}

export class CreateTrackScanStatusDto {
	@ValidateNested()
	@Type(() => TrackScanTaskDto)
	filter: TrackScanTaskDto;

	@IsOptional()
	@IsNumber()
	chunkDuration?: number;
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

export class CompareHistoryScanDto {
	scanHistoryId1: string;
	scanHistoryId2: string;
}
