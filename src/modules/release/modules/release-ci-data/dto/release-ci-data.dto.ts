import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { ReleaseCiDataStatus } from '../entities/release-ci-data.entity';

export enum FieldOrderReleaseCiData {
	createdAt = 'releaseCiData.createdAt',
	updatedAt = 'releaseCiData.updatedAt',
	latestSyncedAt = 'releaseCiData.latestSyncedAt',
	status = 'releaseCiData.status',
}

export class UpsertReleaseCiDataDto {
	@ApiPropertyOptional({ enum: ReleaseCiDataStatus })
	@IsOptional()
	@IsEnum(ReleaseCiDataStatus)
	status?: ReleaseCiDataStatus;

	@ApiPropertyOptional({ description: 'Dữ liệu import nguyên bản từ CI' })
	@IsOptional()
	@IsObject()
	importRawData?: Record<string, any> | null;

	@ApiPropertyOptional({ description: 'Dữ liệu export nguyên bản từ CI' })
	@IsOptional()
	@IsObject()
	exportRawData?: Record<string, any> | null;

	@ApiPropertyOptional({ description: 'Dữ liệu import đã parse' })
	@IsOptional()
	@IsObject()
	importParsedData?: Record<string, any> | null;

	@ApiPropertyOptional({ description: 'Dữ liệu export đã parse' })
	@IsOptional()
	@IsObject()
	exportParsedData?: Record<string, any> | null;
}

export class BulkSyncDataCiDto {
	@ApiPropertyOptional({
		type: [String],
		format: 'uuid',
		description: 'Danh sách ID của dữ liệu CI',
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	ids?: string[];

	@ApiPropertyOptional({
		type: [String],
		format: 'uuid',
		description: 'Danh sách ID bản phát hành',
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	releaseIds?: string[];

	@ApiPropertyOptional({
		nullable: true,
		description:
			'Không truyền: đồng bộ tất cả. Truyền null hoặc "null": chỉ đồng bộ các bản ghi chưa từng đồng bộ.',
		example: null,
	})
	@IsOptional()
	latestSyncedAt?: string | null;
}

export class GetListReleaseCiDataDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@ApiPropertyOptional({ enum: ReleaseCiDataStatus })
	@IsOptional()
	@IsEnum(ReleaseCiDataStatus)
	status?: ReleaseCiDataStatus;

	@ApiPropertyOptional({
		enum: FieldOrderReleaseCiData,
		default: FieldOrderReleaseCiData.updatedAt,
	})
	@IsOptional()
	@IsEnum(FieldOrderReleaseCiData)
	fieldOrder: FieldOrderReleaseCiData = FieldOrderReleaseCiData.updatedAt;

	@ApiPropertyOptional({
		enum: OrderDirection,
		default: OrderDirection.DESC,
	})
	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
