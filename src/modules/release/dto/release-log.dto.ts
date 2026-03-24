import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseLogStatus } from '../entities/release-log.entity';

export enum FieldOrderGetListReleaseLogs {
	createdAt = 'log.createdAt',
}

const toStringArray = ({ value }: { value: unknown }): string[] => {
	if (Array.isArray(value)) {
		return value
			.flatMap((v) => String(v).split(','))
			.map((v) => v.trim())
			.filter(Boolean);
	}

	if (typeof value === 'string') {
		return value
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);
	}

	return [];
};
export class GetListReleaseLogDto extends BaseQueryDto2 {
	@IsOptional()
	@Transform(toStringArray)
	releaseIds?: string[];

	@IsOptional()
	@Transform(toStringArray)
	dspIds?: string[];

	@IsOptional()
	@IsEnum(FieldOrderGetListReleaseLogs)
	fieldOrder: FieldOrderGetListReleaseLogs =
		FieldOrderGetListReleaseLogs.createdAt;

	@IsOptional()
	@Transform(toStringArray)
	@IsArray()
	@IsEnum(ReleaseLogStatus, { each: true })
	status?: ReleaseLogStatus[];
}
