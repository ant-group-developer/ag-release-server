// dtos/query-get-list-log.dto.ts

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ErrorType, LogLevel } from '../entites/logs.entity';

export enum FieldOrderLog {
	log_createdAt = 'log.createdAt',
	log_level = 'log.level',
	log_type = 'log.type',
	log_module = 'log.module',
}

export class QueryGetListLogDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		enum: LogLevel,
		isArray: true,
		description: 'Filter by log levels. Accepts comma-separated values.',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(LogLevel, { each: true })
	level?: LogLevel[];

	@ApiPropertyOptional({
		enum: ErrorType,
		isArray: true,
		description: 'Filter by error types. Accepts comma-separated values.',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(ErrorType, { each: true })
	type?: ErrorType[];

	@ApiPropertyOptional({
		isArray: true,
		description: 'Filter by module names. Accepts comma-separated values.',
	})
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean)
			: [],
	)
	@IsArray()
	@IsString({ each: true })
	modules?: string[];

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	releaseSubmitId?: string;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	releaseSubmitStepId?: string;

	@ApiPropertyOptional({ enum: FieldOrderLog })
	@IsEnum(FieldOrderLog)
	fieldOrder: string = FieldOrderLog.log_createdAt;
}
