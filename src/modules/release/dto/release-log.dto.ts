import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseLogStatus } from '../entities/release-log.entity';

export enum FieldOrderGetListReleaseLogs {
	createdAt = 'log.createdAt',
}

export class GetListReleaseLogDto extends BaseQueryDto2 {
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) =>
		Array.isArray(value)
			? value.map((v) => v?.trim())
			: typeof value === 'string'
				? [value.trim()]
				: [],
	)
	releaseIds: string[];

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) =>
		Array.isArray(value)
			? value.map((v) => v?.trim())
			: typeof value === 'string'
				? [value.trim()]
				: [],
	)
	dspIds: string[];

	@IsOptional()
	@IsEnum(FieldOrderGetListReleaseLogs)
	fieldOrder: FieldOrderGetListReleaseLogs =
		FieldOrderGetListReleaseLogs.createdAt;

	@IsOptional()
	@IsArray()
	@IsEnum(ReleaseLogStatus, { each: true })
	@Transform(({ value }) =>
		Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
	)
	status?: ReleaseLogStatus[];
}
