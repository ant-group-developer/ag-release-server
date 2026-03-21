import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

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
}
