import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
} from 'class-validator';

export enum CiImportOrderBy {
	MODIFY_TIME_ASC = 'modify_time_asc',
	MODIFY_TIME_DESC = 'modify_time_desc',
}

export class GetCiImportsDto {
	@IsOptional()
	@IsString()
	package_id?: string;

	@IsOptional()
	@IsString()
	external_identifier?: string;

	@IsOptional()
	@IsEnum(CiImportOrderBy)
	order_by?: CiImportOrderBy = CiImportOrderBy.MODIFY_TIME_DESC;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return value;
		return Number(value);
	})
	@IsInt()
	page?: number = 0;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return value;
		return Number(value);
	})
	@IsInt()
	page_size?: number = 999;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	@IsBoolean()
	total_count?: boolean = true;

	@IsOptional()
	@IsString()
	timestamp_after?: string;

	@IsOptional()
	@IsString()
	timestamp_before?: string;
}
