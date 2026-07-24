import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PageDto } from 'src/common/dtos/common.response.dto';
import { QueryGetListReleaseDto } from 'src/modules/release/dto/release.dto';
import { ReleaseService } from 'src/modules/release/services/release.service';

/**
 * Thông tin distribution mới nhất gắn vào mỗi release trên list.
 * null = release chưa từng submit qua orchestration.
 */
export interface LatestDistributionInfo {
	distributionId: string;
	distributionState: string;
	distributionType: string;
	distributionUpdatedAt: Date;
}

/** Release item + distribution state (mỗi field distribution có thể null nếu chưa submit). */
export type DistributionListItem = Record<string, unknown> & {
	id: string;
	distributionId: string | null;
	distributionState: string | null;
	distributionType: string | null;
	distributionUpdatedAt: Date | null;
};

/**
 * DistributionListQueryService — list release-centric cho trang phát hành v-next.
 *
 * Tái dùng `ReleaseService.getList` (giữ nguyên logic cover/artist/label/DSP-count v3),
 * rồi batch-load DistributionState mới nhất/release từ bảng `distribution` và merge vào.
 * KHÔNG nhân đôi query release để tránh lệch với list v3.
 */
@Injectable()
export class DistributionListQueryService {
	constructor(
		private readonly releaseService: ReleaseService,
		@InjectDataSource() private readonly dataSource: DataSource,
	) {}

	async list(
		query: QueryGetListReleaseDto,
		filter?: { distributionState?: string },
	): Promise<PageDto<DistributionListItem>> {
		// 1. Trang release (đủ display fields + DSP live/total) — logic v3 tái dùng.
		const page = await this.releaseService.getList(query);
		const releases = page.items as unknown as Array<
			Record<string, unknown>
		>;

		// 2. Batch-load distribution mới nhất theo releaseId.
		const releaseIds = releases.map((r) => r.id as string).filter(Boolean);
		const stateMap = await this.loadLatestDistributions(releaseIds);

		// 3. Merge + (optional) filter theo distributionState.
		let items: DistributionListItem[] = releases.map((r) => {
			const info = stateMap.get(r.id as string) ?? null;
			return {
				...r,
				id: r.id as string,
				distributionId: info?.distributionId ?? null,
				distributionState: info?.distributionState ?? null,
				distributionType: info?.distributionType ?? null,
				distributionUpdatedAt: info?.distributionUpdatedAt ?? null,
			};
		});

		if (filter?.distributionState) {
			items = items.filter(
				(i) => i.distributionState === filter.distributionState,
			);
		}

		return new PageDto({
			items,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems: page.metadata.totalItems,
			},
		});
	}

	/**
	 * DISTINCT ON: 1 distribution mới nhất/release (theo created_at desc).
	 * Empty input → Map rỗng (tránh query `= ANY('{}')`).
	 */
	private async loadLatestDistributions(
		releaseIds: string[],
	): Promise<Map<string, LatestDistributionInfo>> {
		const map = new Map<string, LatestDistributionInfo>();
		if (releaseIds.length === 0) return map;

		const rows: Array<{
			release_id: string;
			id: string;
			state: string;
			type: string;
			updated_at: string;
		}> = await this.dataSource.query(
			`SELECT DISTINCT ON (release_id)
			        release_id, id, state, type, updated_at
			 FROM   distribution
			 WHERE  release_id = ANY($1)
			 ORDER  BY release_id, created_at DESC`,
			[releaseIds],
		);

		for (const row of rows) {
			map.set(row.release_id, {
				distributionId: row.id,
				distributionState: row.state,
				distributionType: row.type,
				distributionUpdatedAt: new Date(row.updated_at),
			});
		}
		return map;
	}
}
