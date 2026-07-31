import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChannelDeliveryOrmEntity } from '../../infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionOrmEntity } from '../../infrastructure/persistence/distribution.orm-entity';

/** 1 channel (per-DSP) của distribution — trạng thái phát hành chi tiết. */
export interface DistributionChannelView {
	channelId: string;
	dspCode: string;
	topology: string;
	/** ChannelState: PENDING/DELIVERING/WAITING/LIVE/ISSUES/TAKEN_DOWN/SKIPPED */
	state: string;
	aggregatorCode: string | null;
	exportMethod: string | null;
	retryCount: number;
	/** Mốc wake-up khi WAITING. */
	scheduledAt: Date | null;
	/** Có ticket lỗi gắn với channel này không. */
	ticketRef: string | null;
}

/**
 * DistributionChannelQueryService — read-side đọc `channel_delivery` (orchestration).
 * KHÔNG đọc release_dsp_delivery (v3). Tenant-scope qua bảng distribution như ticket query.
 */
@Injectable()
export class DistributionChannelQueryService {
	constructor(
		@InjectRepository(ChannelDeliveryOrmEntity)
		private readonly channelRepo: Repository<ChannelDeliveryOrmEntity>,
		@InjectRepository(DistributionOrmEntity)
		private readonly distRepo: Repository<DistributionOrmEntity>,
	) {}

	async listByDistribution(
		distributionId: string,
		allowedTenantIds?: string[],
	): Promise<DistributionChannelView[]> {
		await this.assertOwnership(distributionId, allowedTenantIds);

		const rows = await this.channelRepo.find({
			where: { distributionId },
			order: { spawnOrder: 'ASC' },
		});

		// View là PER-DSP. CI cluster (1 row, dspCode=aggregator) KHÔNG hiện như 1 DSP:
		//  · Chưa fan-out (chưa có watcher) → expand members: mỗi DSP con mang state của cluster
		//    (đang deliver/ingest/qa/export chung — "cả cụm cùng trạng thái").
		//  · Đã fan-out → watcher rows (dspCode thật) đã phản ánh go-live per-DSP → dùng chúng,
		//    bỏ cluster row (SKIPPED, không hiển thị "CI").
		const views: DistributionChannelView[] = [];
		for (const r of rows) {
			if (r.isCluster) {
				// cluster đã fan-out chưa? (có watcher `{clusterId}:golive:` nào không)
				const fannedOut = rows.some((w) =>
					w.channelId.startsWith(`${r.channelId}:golive:`),
				);
				if (fannedOut) continue; // watcher rows sẽ tự hiện per-DSP
				const members =
					(r.memberDspCodes as Array<{
						dspCode: string;
						exportMethod?: string;
					}> | null) ?? [];
				for (const m of members) {
					views.push({
						channelId: `${r.channelId}:golive:${m.dspCode}`,
						dspCode: m.dspCode,
						topology: r.topology,
						state: r.state, // cả cụm cùng trạng thái tới khi fan-out
						aggregatorCode: r.aggregatorCode,
						exportMethod: m.exportMethod ?? null,
						retryCount: r.retryCount,
						scheduledAt: r.scheduledAt,
						ticketRef: r.ticketRef,
					});
				}
				continue;
			}
			views.push({
				channelId: r.channelId,
				dspCode: r.dspCode,
				topology: r.topology,
				state: r.state,
				aggregatorCode: r.aggregatorCode,
				exportMethod: r.exportMethod,
				retryCount: r.retryCount,
				scheduledAt: r.scheduledAt,
				ticketRef: r.ticketRef,
			});
		}
		return views;
	}

	private async assertOwnership(
		distributionId: string,
		allowedTenantIds?: string[],
	): Promise<void> {
		const dist = await this.distRepo.findOne({
			where: { id: distributionId },
			select: { id: true, tenantId: true },
		});
		if (!dist) throw new NotFoundException('Distribution not found');
		if (allowedTenantIds && !allowedTenantIds.includes(dist.tenantId)) {
			throw new ForbiddenException('Distribution outside tenant scope');
		}
	}
}
