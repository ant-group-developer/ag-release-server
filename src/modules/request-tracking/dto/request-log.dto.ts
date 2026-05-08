// request-tracking/dtos/query-get-list-request-log.dto.ts

import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';

export enum RequestMethod {
	GET = 'GET',
	POST = 'POST',
	PUT = 'PUT',
	PATCH = 'PATCH',
	DELETE = 'DELETE',
}

export enum FieldOrderRequestLog {
	requestLog_createdAt = 'requestLog.createdAt',
	requestLog_updatedAt = 'requestLog.updatedAt',
	requestLog_duration = 'requestLog.duration',
	requestLog_statusCode = 'requestLog.statusCode',
	requestLog_method = 'requestLog.method',
}

export class QueryGetListRequestLogDto extends BaseQueryDto2 {
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(RequestMethod, { each: true })
	method?: RequestMethod[];

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	statusCode?: number;

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => Number(v.trim()))
			: [],
	)
	@IsArray()
	statusCodes?: number[];

	@IsOptional()
	@IsUUID()
	userId?: string;

	@IsOptional()
	@IsString()
	userRole?: string;

	@IsOptional()
	@IsString()
	route?: string;

	@IsOptional()
	@IsString()
	url?: string;

	@IsOptional()
	@IsString()
	ip?: string;

	@IsOptional()
	@IsString()
	fromDate?: string;

	@IsOptional()
	@IsString()
	toDate?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	minDuration?: number;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	maxDuration?: number;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	@IsBoolean()
	hasError?: boolean;

	@IsEnum(FieldOrderRequestLog)
	fieldOrder: string = FieldOrderRequestLog.requestLog_createdAt;

	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
