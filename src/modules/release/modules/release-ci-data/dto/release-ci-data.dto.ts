import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsObject,
	IsOptional,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import {
	ReleaseCiDataStatus,
	ReleaseCiExportParsedData,
	ReleaseCiImportParsedData,
	ReleaseCiQaFlag,
} from '../entities/release-ci-data.entity';

export enum FieldOrderReleaseCiData {
	createdAt = 'releaseCiData.createdAt',
	updatedAt = 'releaseCiData.updatedAt',
	latestSyncedAt = 'releaseCiData.latestSyncedAt',
	status = 'releaseCiData.status',
	importCount = 'releaseCiData.importCount',
	dspsLive = 'dsps_live',
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
	importParsedData?: ReleaseCiImportParsedData | null;

	@ApiPropertyOptional({
		description: 'Number of import records from CI raw data',
	})
	@IsOptional()
	@IsInt()
	importCount?: number;

	@ApiPropertyOptional({ description: 'Dữ liệu export đã parse' })
	@IsOptional()
	@IsArray()
	exportParsedData?: ReleaseCiExportParsedData[] | null;

	@ApiPropertyOptional({ description: 'Danh sách QA flags lấy từ CI' })
	@IsOptional()
	@IsArray()
	qaFlagsCi?: ReleaseCiQaFlag[] | null;

	@ApiPropertyOptional({
		description:
			'True when the latest import failed, QA flags exist, and no CI export exists',
	})
	@IsOptional()
	@IsBoolean()
	needImportAgain?: boolean;
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
		type: Boolean,
		description: 'Chỉ lấy bản ghi chưa từng export',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	neverExported?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Chỉ lấy bản ghi có import cuối bị failed',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	lastImportIsFailed?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Only get records that need import again',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	needImportAgain?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Filter records that will skip CI import',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isSkipImport?: boolean;

	@ApiPropertyOptional({
		type: Boolean,
		description: 'Only get records that have QA flags',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	hasQaFlag?: boolean;

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
