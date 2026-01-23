// src/modules/distribution/dsp-release-status/dto/dsp-release-status.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';
import { FieldOrderDspReleaseStatus } from '../enum/dsp-release-status.enum';

export class CreateDspReleaseStatusDto {
	@ApiProperty({ example: 'dsp_001' })
	@IsString()
	@MaxLength(100)
	dspId: string;

	@ApiProperty({ example: 'rel_001' })
	@IsString()
	@MaxLength(100)
	releaseId: string;

	@ApiPropertyOptional({ enum: ReleaseStatus, default: ReleaseStatus.DRAFT })
	@IsOptional()
	@IsEnum(ReleaseStatus)
	status?: ReleaseStatus;
}

export class UpdateDspReleaseStatusDto {
	@ApiPropertyOptional({ enum: ReleaseStatus })
	@IsOptional()
	@IsEnum(ReleaseStatus)
	status?: ReleaseStatus;
}

export class GetListDspReleaseStatusesDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ example: 'dsp_001' })
	@IsOptional()
	@IsString()
	dspId?: string;

	@ApiPropertyOptional({ example: 'rel_001' })
	@IsOptional()
	@IsString()
	releaseId?: string;

	@ApiPropertyOptional({ enum: ReleaseStatus })
	@IsOptional()
	@IsEnum(ReleaseStatus)
	status?: ReleaseStatus;

	// follow template keyword: string[]
	@ApiPropertyOptional({ type: [String], example: ['dsp_001', 'rel_001'] })
	@IsOptional()
	keyword?: string[];

	@IsOptional()
	fieldOrder: string = FieldOrderDspReleaseStatus.createdAt;
}

export class AutoCreateDspReleaseStatusDto {
	@ApiProperty({ example: 'rel_001' })
	@IsString()
	releaseId: string;

	@ApiPropertyOptional({
		enum: ReleaseStatus,
		default: ReleaseStatus.DRAFT,
	})
	@IsOptional()
	@IsEnum(ReleaseStatus)
	defaultStatus?: ReleaseStatus;
}
