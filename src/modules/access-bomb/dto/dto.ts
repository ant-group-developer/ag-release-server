import { Transform } from 'class-transformer';
import { IsArray, IsString } from 'class-validator';

export class ParseReleaseQueryDto {
	@Transform(({ value }) =>
		typeof value === 'string'
			? value
					.split(',')
					.map((v) => v.trim())
					.filter(Boolean)
			: [],
	)
	@IsArray()
	@IsString({ each: true })
	ciOrderIds: string[];
}
