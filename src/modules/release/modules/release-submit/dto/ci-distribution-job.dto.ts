import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { CiJobStatus, CiJobType } from '../entities/ci-distribution-job.entity';

export enum FieldOrderCiJob {
	job_createdAt = 'job.createdAt',
	job_updatedAt = 'job.updatedAt',
	job_status = 'job.status',
	job_type = 'job.type',
	job_upc = 'job.upc',
}

export class QueryGroupedCiJobDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		description: 'Ngày group job',
		example: '2026-05-19',
	})
	@IsOptional()
	@IsDateString()
	dateGroup?: string;

	@ApiPropertyOptional({
		description: 'Danh sách UPC',
		example: ['123456789012', '987654321098'],
		type: [String],
	})
	@IsOptional()
	@Transform(({ value }) =>
		typeof value === 'string' ? value.split(',') : value,
	)
	upcs?: string[];

	@ApiPropertyOptional({
		description: 'Loại CI job',
		enum: CiJobType,
		example: CiJobType.EMAIL_STATE51,
	})
	@IsOptional()
	@IsEnum(CiJobType)
	type?: CiJobType;
}

export class GroupedCiJobDto {
	type: CiJobType;
	deliveryEmail: string | null;
	deliveryEmailSubject: string | null;
	sentAt: Date | null;
	upcs: (string | null)[];
	dateGroup: Date;
	data: {
		id: string;
		upc: string | null;
		dspCodes: string[];
		status: CiJobStatus;
		deliveryEmail: string | null;
		deliveryEmailSubject: string | null;
		sentAt: Date | null;
		stepLabel: string | null;
		releaseSubmitId: string;
		stepId: string;
		releaseId: string | null;
		createdAt: Date;
		updatedAt: Date;
	}[];
}

export class UpdateCiJobDto {
	@ApiProperty({
		description: 'Chỉ cho phép skipped',
		example: 'skipped',
		enum: ['skipped'],
	})
	@IsOptional()
	@IsEnum([CiJobStatus.SKIPPED])
	status?: CiJobStatus.SKIPPED;

	@ApiPropertyOptional({ example: 'support@state51.com' })
	@IsOptional()
	@IsString()
	deliveryEmail?: string;

	@ApiPropertyOptional({
		description: 'DSP CI codes',
		type: [String],
		example: ['SPOTIFY', 'APPLE_MUSIC'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	dspCiCodes?: string[];

	@ApiPropertyOptional({
		example: 'New CI distribution request',
	})
	@IsOptional()
	@IsString()
	deliveryEmailSubject?: string;
}

export class QueryGetListCiJobDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ enum: CiJobType, example: 'email_state51' })
	@IsOptional()
	@IsEnum(CiJobType)
	type?: CiJobType;

	@ApiPropertyOptional({
		description: 'Lọc theo status (comma-separated)',
		example: 'pending,processing',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(CiJobStatus, { each: true })
	status?: CiJobStatus[];

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	releaseSubmitId?: string;

	@ApiPropertyOptional({ example: '196589891234' })
	@IsOptional()
	@IsString()
	upc?: string;

	@ApiPropertyOptional({
		enum: FieldOrderCiJob,
		default: FieldOrderCiJob.job_createdAt,
	})
	@IsEnum(FieldOrderCiJob)
	fieldOrder: string = FieldOrderCiJob.job_createdAt;
}

export class BatchActionCiJobDto {
	@ApiProperty({
		description: 'Danh sách job IDs cần xử lý',
		type: [String],
		example: ['550e8400-e29b-41d4-a716-446655440000'],
	})
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}

export class ConfirmCompletedCiJobDto extends BatchActionCiJobDto {
	@ApiProperty({ description: 'Export ID từ CI' })
	@IsOptional()
	// @IsNotEmpty()
	exportIdFromCi?: string;
}
