import { BadRequestException, Injectable } from '@nestjs/common';
import { Release } from 'src/modules/release/entities/release.entity';
import { EntityManager } from 'typeorm';
import { AssetOwnershipPeriod } from '../entities/asset-ownership-period.entity';
import { AssetOwnershipTransferEvent } from '../entities/asset-ownership-transfer-event.entity';

const BASELINE_DATE = '1900-01-01';

export type AssetOwnershipSource = 'asset_import' | 'channel_transfer';

export interface TransferAssetOwnershipInput {
	releaseId: string;
	tenantId: string;
	labelId: string | null;
	effectiveDate: string;
	revenueEffectiveFrom: string;
	assetImportItemId?: string | null;
	actorId: string;
	note?: string | null;
	source?: AssetOwnershipSource;
	notify?: boolean;
}

export interface TransferManyItem {
	releaseId: string;
	labelId: string | null;
	assetImportItemId?: string | null;
}

export interface TransferManyInput {
	items: TransferManyItem[];
	tenantId: string;
	effectiveDate: string;
	revenueEffectiveFrom: string;
	source: AssetOwnershipSource;
	actorId: string;
	note?: string | null;
	notify: boolean;
}

export interface TransferManyResult {
	transferred: number;
	skippedAlreadyDest: number;
	labelCleared: number;
	baselineCreated: number;
}

/**
 * The sole writer for financial ownership. Keeping it in the same PG
 * transaction as the release update makes the ledger durable and auditable.
 */
@Injectable()
export class AssetOwnershipService {
	async transfer(
		manager: EntityManager,
		input: TransferAssetOwnershipInput,
	): Promise<void> {
		await this.transferMany(manager, {
			items: [
				{
					releaseId: input.releaseId,
					labelId: input.labelId,
					assetImportItemId: input.assetImportItemId,
				},
			],
			tenantId: input.tenantId,
			effectiveDate: input.effectiveDate,
			revenueEffectiveFrom: input.revenueEffectiveFrom,
			source: input.source ?? 'asset_import',
			actorId: input.actorId,
			note: input.note,
			notify: input.notify ?? true,
		});
	}

	async transferMany(
		manager: EntityManager,
		input: TransferManyInput,
	): Promise<TransferManyResult> {
		this.assertDate(input.effectiveDate, 'effectiveDate');
		const revenueEffectiveFrom = this.normalizeRevenueMonth(
			input.revenueEffectiveFrom,
		);

		const result: TransferManyResult = {
			transferred: 0,
			skippedAlreadyDest: 0,
			labelCleared: 0,
			baselineCreated: 0,
		};
		if (!input.items.length) return result;

		for (const item of input.items) {
			await this.assertLabelBelongsToTenant(
				manager,
				item.labelId,
				input.tenantId,
			);
			const outcome = await this.transferOne(manager, {
				item,
				tenantId: input.tenantId,
				effectiveDate: input.effectiveDate,
				revenueEffectiveFrom,
				source: input.source,
				actorId: input.actorId,
				note: input.note ?? null,
				notify: false,
			});
			if (outcome === 'skipped') result.skippedAlreadyDest += 1;
			else {
				result.transferred += 1;
				if (outcome.baselineCreated) result.baselineCreated += 1;
				if (outcome.labelCleared) result.labelCleared += 1;
			}
		}

		if (input.notify) {
			await this.notifyOwnershipSync(manager);
		}
		return result;
	}

	async notifyOwnershipSync(manager: EntityManager): Promise<void> {
		await manager.query(
			"SELECT pg_notify('clickhouse_sync_channel', 'asset_ownership_periods')",
		);
	}

	async recordInitialOwnership(
		manager: EntityManager,
		input: {
			releaseId: string;
			tenantId: string;
			labelId: string | null;
			effectiveDate: string;
			revenueEffectiveFrom: string;
			assetImportItemId?: string | null;
			actorId?: string | null;
			notify?: boolean;
		},
	): Promise<void> {
		this.assertDate(input.effectiveDate, 'effectiveDate');
		const revenueEffectiveFrom = this.normalizeRevenueMonth(
			input.revenueEffectiveFrom,
		);
		await this.assertLabelBelongsToTenant(
			manager,
			input.labelId,
			input.tenantId,
		);
		const exists = await manager.exists(AssetOwnershipPeriod, {
			where: { releaseId: input.releaseId },
		});
		if (exists) return;
		await manager.save(
			manager.create(AssetOwnershipPeriod, {
				releaseId: input.releaseId,
				tenantId: input.tenantId,
				labelId: input.labelId,
				effectiveFrom: input.effectiveDate,
				effectiveTo: null,
				revenueEffectiveFrom,
				revenueEffectiveTo: null,
				assetImportItemId: input.assetImportItemId ?? null,
				createdBy: input.actorId ?? null,
			}),
		);
		await this.enqueueSync(manager, input.releaseId, input.notify ?? true);
	}

	private async transferOne(
		manager: EntityManager,
		args: {
			item: TransferManyItem;
			tenantId: string;
			effectiveDate: string;
			revenueEffectiveFrom: string;
			source: AssetOwnershipSource;
			actorId: string;
			note: string | null;
			notify: boolean;
		},
	): Promise<
		'skipped' | { baselineCreated: boolean; labelCleared: boolean }
	> {
		const { item } = args;
		if (item.assetImportItemId) {
			const existing = await manager.findOne(
				AssetOwnershipTransferEvent,
				{
					where: { assetImportItemId: item.assetImportItemId },
				},
			);
			if (existing) return 'skipped';
		}

		const release = await manager.findOne(Release, {
			where: { id: item.releaseId },
			lock: { mode: 'pessimistic_write' },
		});
		if (!release) throw new BadRequestException('Release không tồn tại');

		const periods = await manager
			.createQueryBuilder(AssetOwnershipPeriod, 'p')
			.setLock('pessimistic_write')
			.where('p.release_id = :releaseId', { releaseId: item.releaseId })
			.orderBy('p.effective_from', 'ASC')
			.getMany();

		let baselineCreated = false;
		if (!periods.length) {
			await manager.save(
				manager.create(AssetOwnershipPeriod, {
					releaseId: release.id,
					tenantId: release.tenantId,
					labelId: release.labelId ?? null,
					effectiveFrom: BASELINE_DATE,
					effectiveTo: null,
					revenueEffectiveFrom: BASELINE_DATE,
					revenueEffectiveTo: null,
					assetImportItemId: null,
					createdBy: null,
				}),
			);
			periods.push(
				await manager.findOneOrFail(AssetOwnershipPeriod, {
					where: {
						releaseId: release.id,
						effectiveFrom: BASELINE_DATE,
					},
				}),
			);
			baselineCreated = true;
		}

		const current = periods.find((p) => !p.effectiveTo);
		if (!current) {
			throw new BadRequestException(
				'Ownership ledger không có period đang mở',
			);
		}

		const currentTenant = current.tenantId;
		const currentLabel = current.labelId ?? null;
		if (currentTenant === args.tenantId && currentLabel === item.labelId) {
			return 'skipped';
		}

		if (args.effectiveDate <= current.effectiveFrom) {
			throw new BadRequestException(
				'Ngày chuyển asset phải sau ngày bắt đầu ownership hiện tại',
			);
		}
		if (args.revenueEffectiveFrom <= current.revenueEffectiveFrom) {
			throw new BadRequestException(
				'Tháng hiệu lực doanh thu phải sau period hiện tại',
			);
		}

		const labelCleared =
			(release.labelId ?? null) != null && item.labelId === null;

		await manager.save(AssetOwnershipTransferEvent, {
			releaseId: release.id,
			fromTenantId: release.tenantId,
			fromLabelId: release.labelId ?? null,
			toTenantId: args.tenantId,
			toLabelId: item.labelId,
			effectiveDate: args.effectiveDate,
			revenueEffectiveFrom: args.revenueEffectiveFrom,
			source: args.source,
			assetImportItemId: item.assetImportItemId ?? null,
			createdBy: args.actorId,
			note: args.note,
		});

		current.effectiveTo = args.effectiveDate;
		current.revenueEffectiveTo = args.revenueEffectiveFrom;
		await manager.save(current);
		await manager.save(
			manager.create(AssetOwnershipPeriod, {
				releaseId: release.id,
				tenantId: args.tenantId,
				labelId: item.labelId,
				effectiveFrom: args.effectiveDate,
				effectiveTo: null,
				revenueEffectiveFrom: args.revenueEffectiveFrom,
				revenueEffectiveTo: null,
				assetImportItemId: item.assetImportItemId ?? null,
				createdBy: args.actorId,
			}),
		);

		await manager.update(Release, release.id, {
			tenantId: args.tenantId,
			labelId: item.labelId,
			modifierId: args.actorId,
		});
		await this.enqueueSync(manager, release.id, args.notify);
		return { baselineCreated, labelCleared };
	}

	private async enqueueSync(
		manager: EntityManager,
		releaseId: string,
		notify: boolean,
	) {
		await manager.query(
			`INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
			 VALUES ('asset_ownership_periods', $1, 'UPDATE', FALSE)
			 ON CONFLICT (entity_name, entity_id) WHERE processed = FALSE
			 DO UPDATE SET created_at = CURRENT_TIMESTAMP,
			   action = CASE WHEN EXCLUDED.action = 'DELETE' THEN 'DELETE' ELSE clickhouse_sync_outbox.action END,
			   error_message = NULL`,
			[releaseId],
		);
		if (notify) {
			await this.notifyOwnershipSync(manager);
		}
	}

	assertDate(value: string, field: string) {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
			Number.isNaN(Date.parse(value))
		) {
			throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD`);
		}
	}

	normalizeRevenueMonth(value: string): string {
		this.assertDate(value, 'revenueEffectiveFrom');
		return `${value.slice(0, 7)}-01`;
	}

	private async assertLabelBelongsToTenant(
		manager: EntityManager,
		labelId: string | null,
		tenantId: string,
	): Promise<void> {
		if (!labelId) return;
		const rows = await manager.query(
			'SELECT 1 FROM labels WHERE id = $1 AND tenant_id = $2 LIMIT 1',
			[labelId, tenantId],
		);
		if (!rows.length) {
			throw new BadRequestException('Label không thuộc workspace đích');
		}
	}
}
