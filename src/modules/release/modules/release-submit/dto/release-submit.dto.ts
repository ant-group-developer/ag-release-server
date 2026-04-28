import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseSubmitStatus } from '../release-submit.enum';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';

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
	@IsUUID()
	releaseId?: string;

	@IsEnum(FieldOrderSubmit)
	fieldOrder: string = FieldOrderSubmit.submit_createdAt;
}

export class ReleaseSubmitResultDto {
	dsp: Dsp;
	status: 'success' | 'failed' | 'processing';
	message: string;
}