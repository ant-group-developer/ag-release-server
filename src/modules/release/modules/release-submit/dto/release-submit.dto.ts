import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseSubmitStatus } from '../release-submit.enum';
import { ExecutionType } from '../entities/release-submit.entity';

export enum FieldOrderSubmit {
	submit_createdAt = 'submit.createdAt',
	submit_updatedAt = 'submit.updatedAt',
	submit_status = 'submit.status',
}

export class QueryGetListSubmitDto extends BaseQueryDto2 {
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(ReleaseSubmitStatus, { each: true })
	status?: ReleaseSubmitStatus[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsArray()
	@IsEnum(ExecutionType, { each: true })
	type?: ExecutionType[];

	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@IsEnum(FieldOrderSubmit)
	fieldOrder: string = FieldOrderSubmit.submit_createdAt;
}

export class ReleaseSubmitResultDto {
	dspCode: string;
	status: string;
}
