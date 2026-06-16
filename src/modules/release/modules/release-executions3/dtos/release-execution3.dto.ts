import { Metadata, PageDto } from 'src/common/dtos/common.response.dto';

// export class QueryGetListReleaseExecutionDto extends BaseQueryDto2 {
// 	@IsOptional()
// 	fieldOrder: string = 'exec.createdAt';

// 	@IsOptional()
// 	orderBy: OrderDirection = OrderDirection.DESC;

// 	@ApiPropertyOptional({
// 		description: 'Filter by statuses',
// 		enum: ExecutionStatus,
// 		isArray: true,
// 	})
// 	@IsOptional()
// 	@IsArray()
// 	@IsEnum(ExecutionStatus, { each: true })
// 	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
// 	status?: ExecutionStatus[];

// 	@ApiPropertyOptional({ description: 'Filter by Release ID' })
// 	@IsOptional()
// 	@IsUUID()
// 	releaseId?: string;
// }

export class ReleaseExecutionResultDto {
	id?: string;
	dspId?: string;
	dspCode: string;
	status?: ReleaseDspStatus;
}

export class ReleaseExecutionMetadata extends Metadata {
	readonly statusCounts?: Record<string, number>;

	constructor(init?: Partial<ReleaseExecutionMetadata>) {
		super(init);
		this.statusCounts = init?.statusCounts;
	}
}

export class ReleaseExecutionPageDto<T> extends PageDto<T> {
	metadata: ReleaseExecutionMetadata;

	constructor({
		items,
		metadata,
	}: {
		items: T[];
		metadata?: Partial<ReleaseExecutionMetadata>;
	}) {
		super({ items, metadata });
		this.metadata = new ReleaseExecutionMetadata({
			page: metadata?.page ?? 1,
			pageSize: metadata?.pageSize ?? items.length,
			totalItems: metadata?.totalItems ?? items.length,
			statusCounts: metadata?.statusCounts,
		});
	}
}

import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
import {
	ExecutionType,
	ReleaseExecutionStepStatus,
} from '../enums/release-execution3.enum';

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

export class QueryGetListReleaseExecution3Dto extends BaseQueryDto2 {
	@IsOptional()
	@IsUUID()
	releaseId?: string;

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
	latestOnly?: boolean;
}
