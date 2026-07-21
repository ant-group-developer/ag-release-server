import { Body, Controller, Post } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { DistributionCommandService } from '../../application/distribution-command.service';

/**
 * DistributionCommandController — write endpoints cho orchestration.
 *
 * Tách khỏi query controller (distribution.controller.ts) để phân chia CQRS rõ ràng.
 * Khối A chỉ có POST /distributions (submit).
 * Khối B/E sẽ thêm approve/reject/retry.
 */
@Controller('distributions')
export class DistributionCommandController {
	constructor(private readonly commandService: DistributionCommandService) {}

	/**
	 * POST /distributions — submit distribution.
	 *
	 * Tạo snapshot + enqueue SUBMIT command vào dist.orchestrate.
	 * Trả về distributionId để client poll timeline/SSE.
	 */
	@Post()
	async submit(
		@Body()
		body: {
			releaseId: string;
			snapshotId: string;
			tenantId: string;
			type: string; // 'INITIAL' | 'UPDATE' | 'TAKEDOWN'
			channelSpecs: any[]; // ChannelDeliverySpec[]
		},
	): Promise<{ distributionId: string }> {
		const correlationId = uuidv4();

		const distributionId = await this.commandService.submit({
			...body,
			correlationId,
		});

		return { distributionId };
	}
}
