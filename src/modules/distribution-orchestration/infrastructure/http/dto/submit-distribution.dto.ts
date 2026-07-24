import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayNotEmpty,
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';

import { ExecutionTypeEnum } from '../../../domain/value-objects/execution-type.enum';

/**
 * SubmitDistributionDto — body của POST /distributions.
 *
 * `tenantId` KHÔNG nhận từ body — lấy từ user đã auth (JWT) để tránh submit hộ
 * tenant khác. `type` validate bằng enum thật (INITIAL_RELEASE/UPDATE/TAKEDOWN),
 * không nhận string tùy ý. `idempotencyKey` client cấp để chống double-submit.
 */
export class SubmitDistributionDto {
	@ApiProperty({ format: 'uuid', description: 'Release cần phát hành' })
	@IsUUID()
	releaseId!: string;

	@ApiProperty({
		enum: ExecutionTypeEnum,
		description: 'Loại execution (INITIAL_RELEASE | UPDATE | TAKEDOWN)',
	})
	@IsEnum(ExecutionTypeEnum)
	type!: ExecutionTypeEnum;

	@ApiProperty({
		type: [String],
		description:
			'Danh sách DSP code muốn phát hành (≥1). Server tự resolve routing/topology.',
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	dspCodes!: string[];

	@ApiPropertyOptional({
		description:
			'Idempotency key client cấp — chống double-submit. Bỏ trống = derive từ releaseId+type.',
	})
	@IsOptional()
	@IsString()
	idempotencyKey?: string;
}
