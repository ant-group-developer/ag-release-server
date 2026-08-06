import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import {
	AssetImportAction,
	AssetImportBatchStatus,
	AssetImportItemStatus,
	AssetImportMatchType,
} from '../enum/asset-import.enum';

/**
 * Chuyển giá trị form-data (chuỗi 'true'/'false') sang boolean.
 * multipart/form-data gửi mọi field dưới dạng chuỗi nên không dùng @IsBoolean trực tiếp được.
 */
const toBoolean = ({ value }: { value: unknown }): unknown => {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1') return true;
	if (value === 'false' || value === '0') return false;
	return value;
};

export class AssetImportOptionsDto {
	@ApiPropertyOptional({
		description: 'Đổi workspace (tenant) và label của bản ghi khớp',
		default: true,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	updateOwnership: boolean = true;

	@ApiPropertyOptional({
		description: 'Đè track title / album title / UPC bằng giá trị trong file',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	overwriteMetadata: boolean = false;

	@ApiPropertyOptional({
		description: 'ISRC/UPC chưa có trong hệ thống thì tạo Release + Track mới',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	createIfNotFound: boolean = false;

	@ApiPropertyOptional({
		description:
			'Chỉ điền vào ô đang trống, không đè lên giá trị đã có. Bật cùng overwriteMetadata sẽ hạ cấp thành chỉ điền ô trống.',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	fillEmptyOnly: boolean = false;

	@ApiPropertyOptional({
		description: 'Label trong file chưa có ở workspace đích thì tạo mới',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	createLabelIfMissing: boolean = false;
}

export class ScanAssetImportDto {
	@ApiProperty({
		description: 'Workspace (tenant) đích để gán asset về',
		example: 'a91f0e5c-1b2d-4e3f-8a7b-9c0d1e2f3a4b',
	})
	@IsNotEmpty()
	@IsUUID()
	targetTenantId: string;

	@ApiPropertyOptional({
		description:
			'Label đích áp dụng cho toàn bộ file. Bỏ trống thì lấy theo cột label trong file.',
	})
	@IsOptional()
	@IsString()
	targetLabelId?: string;

	@ApiPropertyOptional({ type: AssetImportOptionsDto })
	@IsOptional()
	// multipart gửi options dưới dạng chuỗi JSON; parse trước khi validate.
	@Transform(({ value }) => {
		if (typeof value !== 'string') return value;
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	})
	@ValidateNested()
	@Type(() => AssetImportOptionsDto)
	options?: AssetImportOptionsDto;
}

export class ApplyAssetImportDto {
	@ApiPropertyOptional({
		description:
			'Áp dụng toàn bộ item PENDING khớp filter, trừ những id trong excludeItemIds',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	selectAll: boolean = false;

	@ApiPropertyOptional({
		description: 'Danh sách item id muốn apply (dùng khi selectAll = false)',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	itemIds?: string[];

	@ApiPropertyOptional({
		description: 'Item id loại trừ (dùng khi selectAll = true)',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	excludeItemIds?: string[];

	@ApiPropertyOptional({
		description: 'Chỉ apply item có action này (dùng khi selectAll = true)',
		enum: AssetImportAction,
	})
	@IsOptional()
	@IsEnum(AssetImportAction)
	action?: AssetImportAction;
}

export class QueryAssetImportBatchDto extends BaseQueryDto {
	@ApiPropertyOptional({ enum: AssetImportBatchStatus })
	@IsOptional()
	@IsEnum(AssetImportBatchStatus)
	status?: AssetImportBatchStatus;

	@ApiPropertyOptional({ description: 'Lọc theo workspace đích' })
	@IsOptional()
	@IsUUID()
	targetTenantId?: string;

	@ApiPropertyOptional({ description: 'Lọc theo người tạo batch' })
	@IsOptional()
	@IsUUID()
	requestedBy?: string;
}

export class QueryAssetImportItemDto extends BaseQueryDto {
	@ApiPropertyOptional({ enum: AssetImportAction })
	@IsOptional()
	@IsEnum(AssetImportAction)
	action?: AssetImportAction;

	@ApiPropertyOptional({ enum: AssetImportItemStatus })
	@IsOptional()
	@IsEnum(AssetImportItemStatus)
	status?: AssetImportItemStatus;

	@ApiPropertyOptional({ enum: AssetImportMatchType })
	@IsOptional()
	@IsEnum(AssetImportMatchType)
	matchType?: AssetImportMatchType;
}
