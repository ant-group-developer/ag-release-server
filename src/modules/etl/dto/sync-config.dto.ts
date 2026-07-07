import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Matches,
	Min,
} from 'class-validator';

export class UpdateSyncConfigDto {
	@ApiPropertyOptional({
		description: 'Sync mode',
		enum: ['manual', 'auto'],
		example: 'auto',
	})
	@IsOptional()
	@IsEnum(['manual', 'auto'])
	mode?: 'manual' | 'auto';

	@ApiPropertyOptional({
		description: 'Cron expression for auto-sync',
		example: '0 2 * * *',
	})
	@IsOptional()
	@IsString()
	cron?: string;

	@ApiPropertyOptional({
		description: 'Oldest period to sync (YYYYMM format)',
		example: '202501',
	})
	@IsOptional()
	@IsString()
	@Matches(/^\d{6}$/, { message: 'startPeriod must be in YYYYMM format' })
	startPeriod?: string;

	@ApiPropertyOptional({
		description: 'Specific categories to auto-sync',
		type: [String],
		enum: ['trends', 'usage', 'sales', 'illegitimate_activity'],
		example: ['sales', 'trends'],
	})
	@IsOptional()
	@IsArray()
	@IsEnum(['trends', 'usage', 'sales', 'illegitimate_activity'], {
		each: true,
	})
	categories?: Array<'trends' | 'usage' | 'sales' | 'illegitimate_activity'>;

	@ApiPropertyOptional({
		description: 'Force re-import of folders even if already done',
		example: false,
	})
	@IsOptional()
	@IsBoolean()
	force?: boolean;

	@ApiPropertyOptional({
		description: 'Enable or disable exclude patterns filter',
		example: true,
	})
	@IsOptional()
	@IsBoolean()
	excludeEnabled?: boolean;

	@ApiPropertyOptional({
		description: 'Maximum retry attempts for download/import tasks',
		example: 3,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	maxRetries?: number;
}
