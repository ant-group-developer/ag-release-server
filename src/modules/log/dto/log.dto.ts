// dtos/query-get-list-log.dto.ts

import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ErrorType, LogLevel } from '../entites/logs.entity';

export enum FieldOrderLog {
	log_createdAt = 'log.createdAt',
	log_updatedAt = 'log.updatedAt',
	log_level = 'log.level',
	log_type = 'log.type',
	log_module = 'log.module',
}

export class QueryGetListLogDto extends BaseQueryDto2 {
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

	@IsOptional()
	module?: string;

	@IsOptional()
	@IsUUID()
	releaseSubmitId?: string;

	@IsOptional()
	@IsUUID()
	releaseSubmitStepId?: string;

	@IsEnum(FieldOrderLog)
	fieldOrder: string = FieldOrderLog.log_createdAt;
}
