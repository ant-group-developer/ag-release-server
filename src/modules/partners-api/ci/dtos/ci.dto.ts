import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsInt,
	IsOptional,
	IsString,
} from 'class-validator';

export class GetCiReleasesDto {
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => {
		if (!value) return value;
		if (typeof value === 'string')
			return value.split(',').map((i) => i.trim());
		if (Array.isArray(value))
			return value.flatMap((i) =>
				typeof i === 'string' ? i.split(',').map((x) => x.trim()) : i,
			);
		return [value];
	})
	gtin?: string[];

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => {
		if (!value) return value;
		if (typeof value === 'string')
			return value.split(',').map((i) => i.trim());
		if (Array.isArray(value))
			return value.flatMap((i) =>
				typeof i === 'string' ? i.split(',').map((x) => x.trim()) : i,
			);
		return [value];
	})
	upc?: string[];

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => {
		if (!value) return value;
		if (typeof value === 'string')
			return value.split(',').map((i) => i.trim());
		if (Array.isArray(value))
			return value.flatMap((i) =>
				typeof i === 'string' ? i.split(',').map((x) => x.trim()) : i,
			);
		return [value];
	})
	isrc?: string[];

	@IsOptional()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	@IsBoolean()
	has_open_qa_flags?: boolean;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	@IsBoolean()
	has_closed_qa_flags?: boolean;
}

export class GetCiReleaseFormatsDto {
	@IsOptional()
	@IsString()
	gtin?: string;

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
	page_size?: number = 200;
}

export class GetCiQaFlagsDto {
	@IsString()
	releaseFormatsId: string;

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
	page_size?: number = 200;
}

export class GetCiDeliverDesireDto {
	@IsOptional()
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return value;
		return Number(value);
	})
	@IsInt()
	page?: number;

	@IsOptional()
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return value;
		return Number(value);
	})
	@IsInt()
	pageSize?: number = 200;

	@IsOptional()
	@IsString()
	release_id?: string;

	@IsOptional()
	@IsString()
	status?: string;

	@IsOptional()
	@IsString()
	transfer_batch_status?: string;
}
