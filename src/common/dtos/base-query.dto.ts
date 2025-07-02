// src/common/dtos/base-query.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsDate,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { FILED_ORDER_DEFAULT } from '../constants/common.default.constants';
import { OrderDirection } from '../enums/common';

export class BaseQueryDto {
	/** Full‑text search keyword */
	@ApiProperty({
		description: 'Full-text search keyword',
		required: false,
		example: 'search term',
	})
	@IsOptional()
	@IsString()
	@Transform(({ value }: { value: string | undefined }) => value?.trim())
	keyword?: string;

	/** 1‑based page number */
	@ApiProperty({
		description: 'Page number',
		required: false,
		default: 1,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page: number = 1;

	/** Items per page */
	@ApiProperty({
		description: 'Number of items per page',
		required: false,
		default: 10,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	pageSize: number = 10;

	/** Number of records to skip */
	get skip(): number {
		return (this.page - 1) * this.pageSize;
	}

	/** Number of records to take */
	get limit(): number {
		return this.pageSize;
	}

	@IsOptional()
	@IsString()
	fieldOrder: string = FILED_ORDER_DEFAULT;

	@IsOptional()
	@IsString()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.ASC;

	@IsOptional()
	@IsDate()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	startCreatedAt?: Date;

	@IsOptional()
	@IsDate()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	endCreatedAt?: Date;

	@IsOptional()
	@IsDate()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	startUpdatedAt?: Date;

	@IsOptional()
	@IsDate()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	endUpdatedAt?: Date;
}
