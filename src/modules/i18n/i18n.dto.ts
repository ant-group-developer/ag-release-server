import { Type } from 'class-transformer';
import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	MaxLength,
	Min,
} from 'class-validator';

export class CreateI18nDto {
	@IsString()
	@IsNotEmpty()
	key: string; // order.status.PAID

	@IsString()
	@IsNotEmpty()
	@MaxLength(20)
	locale: string; // vi, vi-VN, en-US

	@IsString()
	@IsNotEmpty()
	value: string; // Đã thanh toán

	@IsString()
	@IsOptional()
	description?: string; // ghi chú cho admin
}

export class UpdateI18nDto {
	@IsString()
	@IsOptional()
	value?: string;

	@IsString()
	@IsOptional()
	description?: string | null;
}

export class ListI18nQueryDto {
	@IsString()
	@IsOptional()
	locale?: string; // filter theo locale

	@IsString()
	@IsOptional()
	prefix?: string; // order., error., auth.

	@IsString()
	@IsOptional()
	q?: string; // search contains key/value

	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	@IsOptional()
	limit?: number = 50;

	@Type(() => Number)
	@IsInt()
	@Min(0)
	@IsOptional()
	offset?: number = 0;
}
