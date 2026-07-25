import { Metadata, PageDto } from 'src/common/dtos/common.response.dto';

export class ReleaseExecutionResultDto {
	id?: string;
	dspId?: string;
	dspCode: string;
	dspCodeCi?: string | null;
	status: ReleaseDspStatus;
}

export class ReleaseExecution3Metadata extends Metadata {
	readonly statusCounts?: Record<string, number>;

	constructor(init?: Partial<ReleaseExecution3Metadata>) {
		super(init);
		this.statusCounts = init?.statusCounts;
	}
}

export class ReleaseExecutionPageDto<T> extends PageDto<T> {
	metadata: ReleaseExecution3Metadata;

	constructor({
		items,
		metadata,
	}: {
		items: T[];
		metadata?: Partial<ReleaseExecution3Metadata>;
	}) {
		super({ items, metadata });
		this.metadata = new ReleaseExecution3Metadata({
			page: metadata?.page ?? 1,
			pageSize: metadata?.pageSize ?? items.length,
			totalItems: metadata?.totalItems ?? items.length,
			statusCounts: metadata?.statusCounts,
		});
	}
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { QueryGetListReleaseDto } from 'src/modules/release/dto/release.dto';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import {
	ExecutionType,
	ReleaseExecutionStatus,
	ReleaseExecutionStepStatus,
	ReleaseExecutionStepType,
} from '../enums/release-execution3.enum';

export enum FieldOrderReleaseExecution3 {
	execution_createdAt = 'execution.createdAt',
	execution_type = 'execution.type',
	execution_releaseTitle = 'execution.releaseTitle',
	execution_releaseUpc = 'execution.releaseUpc',
	execution_status = 'execution.status',
}

export class CreateReleaseExecution3Dto {
	@IsUUID()
	releaseId: string;

	@IsArray()
	@IsString({ each: true })
	dspCodes: string[];

	@IsOptional()
	@IsEnum(ExecutionType)
	type?: ExecutionType;
}

export class RetryReleaseExecutionStepDto {
	@ApiPropertyOptional({
		description:
			'Bỏ qua kiểm tra độ ưu tiên, luôn ghi đè trạng thái mới nhất xuống Database',
		type: Boolean,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	isOverrideStatus?: boolean;
}

export class QueryReleaseExecutionStepDto {
	@IsOptional()
	@IsEnum(ReleaseExecutionStepType)
	type?: ReleaseExecutionStepType;

	@IsOptional()
	@IsEnum(ReleaseExecutionStepStatus)
	status?: ReleaseExecutionStepStatus;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === true || value === 'true') return true;
		if (value === false || value === 'false') return false;
		return value;
	})
	@IsBoolean()
	exclude?: boolean;
}

export class QueryGetListReleaseExecution3Dto extends BaseQueryDto2 {
	@IsOptional()
	@IsEnum(FieldOrderReleaseExecution3)
	fieldOrder: FieldOrderReleaseExecution3 =
		FieldOrderReleaseExecution3.execution_createdAt;

	@IsOptional()
	@Transform(({ value }) => {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		return String(value)
			.split(',')
			.map((item) => item.trim());
	})
	@IsUUID('4', { each: true })
	@IsArray()
	releaseIds?: string[];

	@IsOptional()
	@Transform(({ value }) => {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		return String(value)
			.split(',')
			.map((item) => item.trim());
	})
	@IsEnum(ReleaseExecutionStatus, { each: true })
	@IsArray()
	status?: ReleaseExecutionStatus[];

	@IsOptional()
	@Transform(({ value }) => {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		return String(value)
			.split(',')
			.map((item) => item.trim());
	})
	@IsEnum(ExecutionType, { each: true })
	@IsArray()
	type?: ExecutionType[];

	@IsOptional()
	@Transform(({ value }) => {
		if (value === true || value === 'true') return true;
		if (value === false || value === 'false') return false;
		return value;
	})
	@IsBoolean()
	latestOnly?: boolean;

	@IsOptional()
	@Transform(({ value }) => {
		if (!value) return [];
		if (Array.isArray(value)) return value;
		if (typeof value === 'object') return [value];

		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [parsed];
		} catch {
			return [];
		}
	})
	@ValidateNested({ each: true })
	@Type(() => QueryReleaseExecutionStepDto)
	steps?: QueryReleaseExecutionStepDto[];

	@IsOptional()
	@ValidateNested()
	@Type(() => QueryGetListReleaseDto)
	queryListReleases?: QueryGetListReleaseDto;
}
