import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { DistributionCommandService } from '../../application/distribution-command.service';
import { SubmitDistributionDto } from './dto/submit-distribution.dto';

/**
 * DistributionCommandController — write endpoints cho orchestration.
 *
 * Tách khỏi query controller (distribution.controller.ts) để phân chia CQRS rõ ràng.
 * Auth: JwtAuthGuard + PolicyGuard đã đăng ký global (APP_GUARD) → mọi endpoint yêu cầu JWT.
 * Khối A chỉ có POST /distributions (submit). Khối B/E thêm approve/reject/retry.
 */
@ApiTags('Distribution Orchestration')
@Controller('distributions')
export class DistributionCommandController {
	constructor(private readonly commandService: DistributionCommandService) {}

	/**
	 * POST /distributions — submit distribution.
	 *
	 * Tạo snapshot bất biến từ release + enqueue SUBMIT vào dist.orchestrate.
	 * `tenantId` lấy từ user đã auth (KHÔNG nhận từ body → chống submit hộ tenant khác).
	 * Trả distributionId để client poll timeline/SSE.
	 */
	@Post()
	@ApiOperation({ summary: 'Submit release để phát hành (tạo distribution)' })
	async submit(
		@Body() body: SubmitDistributionDto,
		@User() user: UserReq,
	): Promise<{ distributionId: string }> {
		const distributionId = await this.commandService.submit({
			releaseId: body.releaseId,
			type: body.type,
			channelSpecs: body.channelSpecs,
			tenantId: user.tenantId,
			idempotencyKey: body.idempotencyKey,
		});

		return { distributionId };
	}
}
