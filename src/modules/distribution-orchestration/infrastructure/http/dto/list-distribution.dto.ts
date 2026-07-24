import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { QueryGetListReleaseDto2 } from 'src/modules/release/dto/release.dto';
import { DistributionState } from '../../../domain/distribution/distribution-state.enum';

/**
 * ListDistributionDto — query cho GET /distributions (list release-centric).
 *
 * Kế thừa QueryGetListReleaseDto2 (khớp ReleaseService.getList2 / getManyAndCountOptimized)
 * để tái dùng logic list tối ưu. `distributionState` lọc theo milestone v-next.
 *
 * Lưu ý: DTO2 KHÔNG khai `isImportedFromReport` (chỉ DTO1 có) nhưng filterByQuery2 vẫn
 * dùng field này → phải tự khai lại ở đây, nếu không whitelist:true strip mất filter.
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
