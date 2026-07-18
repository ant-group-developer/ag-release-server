import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';

export class CreateSonarScheduleDto {
	@ApiProperty({
		example: 'Spotify Sonar nightly',
		description: 'Tên schedule',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	name: string;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@ApiProperty({ example: '0 2 * * *', description: 'Cron expression' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	cronExpression: string;

	@ApiPropertyOptional({
		example: 'Asia/Ho_Chi_Minh',
		default: 'Asia/Ho_Chi_Minh',
	})
	@IsOptional()
	@IsString()
	@MaxLength(80)
	timezone?: string;

	@ApiPropertyOptional({
		example: true,
		nullable: true,
		description:
			'true: chỉ release từ report, false: chỉ release không từ report, null: tất cả',
	})
	@IsOptional()
	@IsBoolean()
	isImportedFromReport?: boolean | null;

	@ApiPropertyOptional({
		example: 500,
		nullable: true,
		default: 500,
		description: 'Số release tối đa mỗi lần chạy',
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	limitCount?: number | null;

	@ApiPropertyOptional({
		example: false,
		default: false,
		description: 'Re-fetch release đã có data trong 24h',
	})
	@IsOptional()
	@IsBoolean()
	force?: boolean;
}

export class UpdateSonarScheduleDto extends PartialType(
	CreateSonarScheduleDto,
) {}
