import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayNotEmpty,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { ReleaseStatus } from '../enum/release.enum';

export class UpdateReleaseCiStatusSyncScheduleDto {
	@ApiPropertyOptional({
		default: false,
		description: 'Bật hoặc tắt đồng bộ trạng thái release từ CI',
	})
	@IsOptional()
	@IsBoolean()
	syncStatusEnabled?: boolean;

	@ApiPropertyOptional({
		example: '0 6 * * *',
		description: 'Cron expression của lịch đồng bộ',
	})
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	cronExpression?: string;

	@ApiPropertyOptional({
		example: 'Asia/Ho_Chi_Minh',
		default: 'Asia/Ho_Chi_Minh',
		description: 'Timezone dùng để chạy cron',
	})
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@MaxLength(80)
	timezone?: string;

	@ApiPropertyOptional({
		enum: ReleaseStatus,
		isArray: true,
		example: [ReleaseStatus.PROCESSING, ReleaseStatus.FAILED],
		description: 'Các trạng thái release cần đồng bộ từ CI',
	})
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@IsEnum(ReleaseStatus, { each: true })
	releaseStatuses?: ReleaseStatus[];

	@ApiPropertyOptional({
		default: 100,
		minimum: 1,
		maximum: 500,
		description: 'Số release được lấy trong mỗi batch',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(500)
	batchSize?: number;

	@ApiPropertyOptional({
		default: 3,
		minimum: 1,
		maximum: 10,
		description: 'Số release được đồng bộ đồng thời',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(10)
	concurrency?: number;
}
