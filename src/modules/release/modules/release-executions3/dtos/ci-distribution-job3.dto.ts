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
import { CiJobStatus3, CiJobType3 } from '../enums/release-execution3.enum';

export enum FieldOrderCiJob3 {
	job_createdAt = 'job.createdAt',
	job_updatedAt = 'job.updatedAt',
	job_status = 'job.status',
	job_type = 'job.type',
	job_upc = 'job.upc',
}

export class QueryGroupedCiJob3Dto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		description: 'Ngày group job',
		example: '2026-05-19',
	})
	@IsOptional()
	@IsDateString()
	dateGroup?: string;

	@ApiPropertyOptional({
		description: 'Danh sách status',
		example: ['pending', 'processing'],
		type: [String],
	})
	@IsOptional()
	@Transform(({ value }) =>
		typeof value === 'string' ? value.split(',') : value,
	)
	status?: string[];

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
		enum: CiJobType3,
		example: CiJobType3.EMAIL_STATE51,
	})
	@IsOptional()
	@IsEnum(CiJobType3)
	type?: CiJobType3;
}

export class GroupedCiJob3Dto {
	type: CiJobType3;
	deliveryEmail: string | null;
	deliveryEmailSubject: string | null;
	sentAt: Date | null;
	upcs: (string | null)[];
	dateGroup: Date;
	data: {
		id: string;
		upc: string | null;
		dspCodes: string[];
		status: CiJobStatus3;
		deliveryEmail: string | null;
		deliveryEmailSubject: string | null;
		sentAt: Date | null;
		stepLabel: string | null;
		releaseExecutionId: string;
		stepId: string;
		releaseId: string | null;
		createdAt: Date;
		updatedAt: Date;
	}[];
}

export class UpdateCiJob3Dto {
	// nếu cần thì thêm
	@ApiProperty({
		description: 'Chỉ cho phép skipped',
		example: 'skipped',
		enum: ['skipped'],
	})
	@IsOptional()
	// @IsEnum([CiJobStatus3.CANCEL])
	status?: CiJobStatus3.CANCEL = CiJobStatus3.CANCEL;

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

export class QueryGetListCiJob3Dto extends BaseQueryDto2 {
	@ApiPropertyOptional({ enum: CiJobType3, example: 'email_state51' })
	@IsOptional()
	@IsEnum(CiJobType3)
	type?: CiJobType3;

	@ApiPropertyOptional({
		description: 'Lọc theo status comma-separated',
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
	@IsEnum(CiJobStatus3, { each: true })
	status?: CiJobStatus3[];

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@ApiPropertyOptional({ example: '196589891234' })
	@IsOptional()
	@IsString()
	upc?: string;

	@ApiPropertyOptional({
		enum: FieldOrderCiJob3,
		default: FieldOrderCiJob3.job_createdAt,
	})
	@IsEnum(FieldOrderCiJob3)
	fieldOrder: string = FieldOrderCiJob3.job_createdAt;
}

export class BatchActionCiJob3Dto {
	@ApiProperty({
		description: 'Danh sách job IDs cần xử lý',
		type: [String],
		example: ['550e8400-e29b-41d4-a716-446655440000'],
	})
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}

export class ConfirmCompletedCiJob3Dto extends BatchActionCiJob3Dto {
	@ApiPropertyOptional({ description: 'Export ID từ CI' })
	@IsOptional()
	@IsString()
	exportIdFromCi?: string;
}
