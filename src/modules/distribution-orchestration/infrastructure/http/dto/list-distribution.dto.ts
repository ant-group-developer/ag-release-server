import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsOptional,
	IsUUID,
} from 'class-validator';

import { QueryGetListReleaseDto2 } from 'src/modules/release/dto/release.dto';
import { DistributionState } from '../../../domain/distribution/distribution-state.enum';

/**
 * ListDistributionDto — query cho GET /distributions (list release-centric).
 *
 * Kế thừa QueryGetListReleaseDto2 (khớp ReleaseService.getList2 / getManyAndCountOptimized).
 * `distributionState` lọc theo milestone v-next (post-query filter).
 *
 * ⚠ DTO2 có `releaseIds` nhưng `filterByQuery2` bên trong destructure field `ids` (DTO1).
 * Khai thêm `ids` ở đây để NestJS whitelist giữ lại → runtime destructure hoạt động đúng.
 * `isImportedFromReport` tương tự (DTO2 không khai, filterByQuery2 đọc).
 */
export class ListDistributionDto extends QueryGetListReleaseDto2 {
	@ApiPropertyOptional({
		enum: DistributionState,
		description:
			'Lọc theo DistributionState (milestone v-next). Bỏ trống = mọi trạng thái.',
	})
	@IsOptional()
	@IsEnum(DistributionState)
	distributionState?: DistributionState;

	@ApiPropertyOptional({
		description: 'Lọc theo release IDs cụ thể (UUID[]).',
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	@Transform(({ value }) =>
		Array.isArray(value) ? value : value ? [value] : [],
	)
	ids?: string[];

	@ApiPropertyOptional({
		description: 'Ẩn release nhập từ report (mặc định client gửi false).',
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	isImportedFromReport?: boolean;
}
