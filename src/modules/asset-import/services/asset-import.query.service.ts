import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Label } from 'src/modules/label/entities/label.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import {
	QueryAssetImportBatchDto,
	QueryAssetImportItemDto,
} from '../dto/asset-import.dto';
import { AssetImportBatch } from '../entities/asset-import-batch.entity';
import { AssetImportItem } from '../entities/asset-import-item.entity';

/** Workspace đích của batch, resolve sẵn để FE không phải gọi thêm API. */
export interface AssetImportTenantView {
	id: string;
	name: string | null;
	title: string | null;
	code: string | null;
	icon: string | null;
}

/** Batch kèm thông tin workspace đích đã join. */
export type AssetImportBatchView = Omit<AssetImportBatch, 'targetTenant'> & {
	targetTenant: AssetImportTenantView | null;
};

/** Item kèm dữ liệu hiện tại đã resolve tên, dạng trả về cho FE. */
export interface AssetImportItemView {
	id: string;
	rowNumber: number;
	isrc: string | null;
	upc: string | null;
	trackName: string | null;
	albumName: string | null;
	labelName: string | null;
	matchType: string;
	action: string;
	status: string;
	matchedReleaseId: string | null;
	matchedTrackId: string | null;
	current: {
		tenantId: string | null;
		tenantName: string | null;
		labelId: string | null;
		labelName: string | null;
	};
	changes: unknown[];
	errorMessage: string | null;
	appliedAt: Date | null;
}

@Injectable()
export class AssetImportQueryService {
	constructor(
		@InjectRepository(AssetImportBatch)
		private readonly batchRepo: Repository<AssetImportBatch>,
		@InjectRepository(AssetImportItem)
		private readonly itemRepo: Repository<AssetImportItem>,
		private readonly dataSource: DataSource,
	) {}

	async listBatches(
		query: QueryAssetImportBatchDto,
	): Promise<PageDto<AssetImportBatchView>> {
		const qb = this.batchRepo
			.createQueryBuilder('batch')
			.leftJoinAndSelect('batch.targetTenant', 'targetTenant');

		if (query.status) {
			qb.andWhere('batch.status = :status', { status: query.status });
		}
		if (query.targetTenantId) {
			qb.andWhere('batch.targetTenantId = :tenantId', {
				tenantId: query.targetTenantId,
			});
		}
		if (query.requestedBy) {
			qb.andWhere('batch.requestedBy = :requestedBy', {
				requestedBy: query.requestedBy,
			});
		}
		if (query.keyword) {
			qb.andWhere('batch.fileName ILIKE :keyword', {
				keyword: `%${query.keyword}%`,
			});
		}

		const [items, totalItems] = await qb
			.orderBy('batch.createdAt', 'DESC')
			.skip(query.skip)
			.take(query.limit)
			.getManyAndCount();

		return new PageDto({
			items: items.map((batch) => this.toBatchView(batch)),
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	/**
	 * Batch kèm workspace đích. Entity chỉ giữ targetTenantId nên FE phải gọi
	 * thêm API tenant để hiện tên — join sẵn ở đây để đỡ một vòng.
	 */
	toBatchView(batch: AssetImportBatch): AssetImportBatchView {
		const tenant = batch.targetTenant;

		return {
			...batch,
			targetTenant: tenant
				? {
						id: tenant.id,
						name: tenant.name ?? null,
						title: tenant.title ?? null,
						code: tenant.code ?? null,
						icon: tenant.icon ?? null,
					}
				: null,
		};
	}

	/**
	 * Danh sách item của một batch, kèm tên workspace/label hiện tại để FE
	 * hiển thị diff mà không phải gọi thêm API.
	 */
	async listItems(
		batchId: string,
		query: QueryAssetImportItemDto,
	): Promise<PageDto<AssetImportItemView>> {
		const qb = this.itemRepo
			.createQueryBuilder('item')
			.where('item.batchId = :batchId', { batchId });

		if (query.action) {
			qb.andWhere('item.action = :action', { action: query.action });
		}
		if (query.status) {
			qb.andWhere('item.status = :status', { status: query.status });
		}
		if (query.matchType) {
			qb.andWhere('item.matchType = :matchType', {
				matchType: query.matchType,
			});
		}
		if (query.keyword) {
			const keyword = `%${query.keyword}%`;
			qb.andWhere(
				new Brackets((w) => {
					w.where('item.isrc ILIKE :keyword', { keyword })
						.orWhere('item.upc ILIKE :keyword', { keyword })
						.orWhere('item.trackName ILIKE :keyword', { keyword })
						.orWhere('item.albumName ILIKE :keyword', { keyword });
				}),
			);
		}

		const [items, totalItems] = await qb
			.orderBy('item.rowNumber', 'ASC')
			.skip(query.skip)
			.take(query.limit)
			.getManyAndCount();

		const views = await this.attachDisplayNames(items);

		return new PageDto({
			items: views,
			metadata: {
				page: query.page,
				pageSize: query.pageSize,
				totalItems,
			},
		});
	}

	/** Thống kê theo action/status để FE dựng bộ đếm trên đầu bảng. */
	async getBatchSummary(batchId: string) {
		const [byAction, byStatus] = await Promise.all([
			this.itemRepo
				.createQueryBuilder('item')
				.select('item.action', 'key')
				.addSelect('COUNT(*)', 'count')
				.where('item.batchId = :batchId', { batchId })
				.groupBy('item.action')
				.getRawMany<{ key: string; count: string }>(),
			this.itemRepo
				.createQueryBuilder('item')
				.select('item.status', 'key')
				.addSelect('COUNT(*)', 'count')
				.where('item.batchId = :batchId', { batchId })
				.groupBy('item.status')
				.getRawMany<{ key: string; count: string }>(),
		]);

		const toMap = (rows: { key: string; count: string }[]) =>
			Object.fromEntries(rows.map((r) => [r.key, Number(r.count)]));

		return { byAction: toMap(byAction), byStatus: toMap(byStatus) };
	}

	private async attachDisplayNames(
		items: AssetImportItem[],
	): Promise<AssetImportItemView[]> {
		const tenantIds = [
			...new Set(
				items.map((i) => i.currentTenantId).filter((v): v is string => !!v),
			),
		];
		const labelIds = [
			...new Set(
				items.map((i) => i.currentLabelId).filter((v): v is string => !!v),
			),
		];

		const [tenants, labels] = await Promise.all([
			tenantIds.length
				? this.dataSource
						.getRepository(Tenant)
						.find({ where: { id: In(tenantIds) } })
				: Promise.resolve([]),
			labelIds.length
				? this.dataSource
						.getRepository(Label)
						.find({ where: { id: In(labelIds) } })
				: Promise.resolve([]),
		]);

		const tenantNames = new Map(
			tenants.map((t) => [t.id, t.name ?? t.title ?? '']),
		);
		const labelNames = new Map(labels.map((l) => [l.id, l.name]));

		return items.map((item) => ({
			id: item.id,
			rowNumber: item.rowNumber,
			isrc: item.isrc,
			upc: item.upc,
			trackName: item.trackName,
			albumName: item.albumName,
			labelName: item.labelName,
			matchType: item.matchType,
			action: item.action,
			status: item.status,
			matchedReleaseId: item.matchedReleaseId,
			matchedTrackId: item.matchedTrackId,
			current: {
				tenantId: item.currentTenantId,
				tenantName: item.currentTenantId
					? (tenantNames.get(item.currentTenantId) ?? null)
					: null,
				labelId: item.currentLabelId,
				labelName: item.currentLabelId
					? (labelNames.get(item.currentLabelId) ?? null)
					: null,
			},
			changes: item.changes,
			errorMessage: item.errorMessage,
			appliedAt: item.appliedAt,
		}));
	}
}
