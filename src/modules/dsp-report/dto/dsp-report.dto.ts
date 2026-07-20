import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';

export enum DspReportSource {
	FTP_FOLDER = 'ftp_folder',
	WMG_REPORT = 'wmg_report',
	SPOTIFY_REPORT = 'spotify_report',
}

export class QueryGetListDspReportDto extends BaseQueryDto {
	@ApiProperty({
		description: 'Filter by assignment status',
		required: false,
		enum: ['assigned', 'unassigned'],
	})
	@IsOptional()
	@IsString()
	status?: string;

	@ApiProperty({
		description: 'Filter by DSP report source',
		required: false,
		enum: DspReportSource,
		example: DspReportSource.WMG_REPORT,
	})
	@IsOptional()
	@IsEnum(DspReportSource)
	source?: DspReportSource;

	@ApiProperty({
		description: 'Field to sort by',
		required: false,
		default: 'name',
	})
	@IsOptional()
	@IsString()
	fieldOrder: string = 'name';

	@ApiProperty({
		description: 'Sort direction',
		required: false,
		enum: OrderDirection,
		default: OrderDirection.ASC,
	})
	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.ASC;
}

export class CreateDspReportDto {
	@ApiProperty()
	@IsString()
	dspName: string;

	@ApiProperty()
	@IsString()
	source: string;
}

export class AssignDspReportDto {
	@ApiProperty()
	@IsString()
	pgUuid: string;
}
