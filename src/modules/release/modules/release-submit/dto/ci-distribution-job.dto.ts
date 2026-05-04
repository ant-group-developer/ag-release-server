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

export class QueryGetListCiJobDto extends BaseQueryDto2 {
	@IsOptional()
	@IsEnum(CiJobType)
	type?: CiJobType;

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

	@IsOptional()
	@IsUUID()
	releaseSubmitId?: string;

	@IsOptional()
	@IsString()
	upc?: string;

	@IsEnum(FieldOrderCiJob)
	fieldOrder: string = FieldOrderCiJob.job_createdAt;
}

export class BatchActionCiJobDto {
	@IsArray()
	@IsUUID('4', { each: true })
	ids: string[];
}
