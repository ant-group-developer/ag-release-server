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
	dspCode: string;
	status: string;
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
