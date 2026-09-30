import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsDateString,
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
		description:
			'Đè track title / album title / UPC bằng giá trị trong file',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	overwriteMetadata: boolean = false;

	@ApiPropertyOptional({
		description:
			'ISRC/UPC chưa có trong hệ thống thì tạo Release + Track mới',
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

export class PresignAssetImportDto {
	@ApiProperty({
		description: 'Tên file gốc, dùng để kiểm tra đuôi và đặt tên trên R2',
		example: 'assets-warner-2026.xlsx',
	})
	@IsNotEmpty()
	@IsString()
	fileName: string;

	@ApiPropertyOptional({
		description: 'Content-Type sẽ dùng khi PUT lên URL trả về',
	})
	@IsOptional()
	@IsString()
	contentType?: string;
}

export class ScanAssetImportDto {
	@ApiProperty({
		description:
			'Key file đã upload lên R2 qua /asset-import/uploads/presign. Phải nằm trong thư mục asset-import/.',
		example: 'asset-import/9f1c.../assets.xlsx',
	})
	@IsNotEmpty()
	@IsString()
	r2Key: string;

	@ApiProperty({
		description: 'Workspace (tenant) đích để gán asset về',
		example: 'a91f0e5c-1b2d-4e3f-8a7b-9c0d1e2f3a4b',
	})
	@IsNotEmpty()
	@IsUUID()
	targetTenantId: string;

	@ApiPropertyOptional({
		description: 'Ngày chuyển quyền cho trends/usage (YYYY-MM-DD)',
		example: '2026-09-01',
	})
	@IsOptional()
	@IsDateString()
	effectiveDate?: string;

	@ApiPropertyOptional({
		description:
			'Tháng bắt đầu ghi nhận revenue cho owner mới (YYYY-MM-01). Mặc định là tháng của effectiveDate.',
		example: '2026-09-01',
	})
	@IsOptional()
	@IsDateString()
	revenueEffectiveFrom?: string;

	@ApiPropertyOptional({ type: AssetImportOptionsDto })
	@IsOptional()
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
		description:
			'Danh sách item id muốn apply (dùng khi selectAll = false)',
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
		description:
			'Cho phép chạy lại các item FAILED (dùng để retry sau khi release import đã được merge/remap)',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	retryFailed: boolean = false;

	@ApiPropertyOptional({
		description: 'Chỉ apply item có action này (dùng khi selectAll = true)',
		enum: AssetImportAction,
	})
	@IsOptional()
	@IsEnum(AssetImportAction)
	action?: AssetImportAction;
}

export class MergeAssetImportDuplicatesDto extends ApplyAssetImportDto {
	@ApiPropertyOptional({
		description:
			'Chỉ merge các release import nguồn này trong những item đã chọn',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	sourceReleaseIds?: string[];

	@ApiPropertyOptional({
		description:
			'Cho phép merge cặp chỉ bị chặn bởi UPC_NOT_EQUIVALENT. Phải truyền sourceReleaseIds.',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	force: boolean = false;
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
