import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { ImportJobSourceType, ImportJobStatus } from '../interfaces';

export class QueryGetListJobsDto extends BaseQueryDto {
	@ApiPropertyOptional({
		description: 'Filter jobs by status',
		enum: ImportJobStatus,
		example: ImportJobStatus.PENDING,
	})
	@IsOptional()
	@IsEnum(ImportJobStatus)
	status?: ImportJobStatus;

	@ApiPropertyOptional({
		description: 'Filter jobs by source type',
		enum: ImportJobSourceType,
		example: ImportJobSourceType.REPORT_UPLOAD,
	})
	@IsOptional()
	@IsEnum(ImportJobSourceType)
	sourceType?: ImportJobSourceType;

	@ApiPropertyOptional({
		description: 'Filter jobs by tenant ID',
		example: '123e4567-e89b-12d3-a456-426614174000',
	})
	@IsOptional()
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({
		description: 'Field to order by',
		default: 'createdAt',
		example: 'createdAt',
	})
	@IsOptional()
	@IsString()
	fieldOrder: string = 'createdAt';

	@ApiPropertyOptional({
		description: 'Order direction',
		enum: OrderDirection,
		default: OrderDirection.DESC,
		example: OrderDirection.DESC,
	})
	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
