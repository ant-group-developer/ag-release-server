import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { CiJobStatus, CiJobType } from '../entities/ci-distribution-job.entity';

export enum FieldOrderCiJob {
	job_createdAt = 'job.createdAt',
	job_updatedAt = 'job.updatedAt',
	job_status = 'job.status',
	job_type = 'job.type',
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
