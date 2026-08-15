import { BadRequestException, Injectable } from '@nestjs/common';
import { Release } from 'src/modules/release/entities/release.entity';
import { EntityManager } from 'typeorm';
import { AssetOwnershipPeriod } from '../entities/asset-ownership-period.entity';
import { AssetOwnershipTransferEvent } from '../entities/asset-ownership-transfer-event.entity';

const BASELINE_DATE = '1900-01-01';

export interface TransferAssetOwnershipInput {
	releaseId: string;
	tenantId: string;
	labelId: string | null;
	effectiveDate: string;
	revenueEffectiveFrom: string;
	assetImportItemId?: string | null;
	actorId: string;
	note?: string | null;
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
		this.assertDate(input.effectiveDate, 'effectiveDate');
		this.assertDate(input.revenueEffectiveFrom, 'revenueEffectiveFrom');
		await this.assertLabelBelongsToTenant(
			manager,
			input.labelId,
			input.tenantId,
		);

		if (input.assetImportItemId) {
			const existing = await manager.findOne(
				AssetOwnershipTransferEvent,
				{
					where: { assetImportItemId: input.assetImportItemId },
				},
			);
			if (existing) return;
		}

		// Serialize all ownership edits for this release, including backdated ones.
		await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
			input.releaseId,
		]);
		const release = await manager.findOne(Release, {
			where: { id: input.releaseId },
			lock: { mode: 'pessimistic_write' },
		});
		if (!release) throw new BadRequestException('Release không tồn tại');

		if (
			release.tenantId === input.tenantId &&
			(release.labelId ?? null) === input.labelId
		) {
			return;
		}

		const periods = await manager
			.createQueryBuilder(AssetOwnershipPeriod, 'p')
			.setLock('pessimistic_write')
			.where('p.release_id = :releaseId', { releaseId: input.releaseId })
			.orderBy('p.effective_from', 'ASC')
			.getMany();

		// Releases created before this feature receive one explicit baseline window.
		// It is marked as a baseline in the event ledger only on the first transfer;
		// historical corrections can then be inserted as normal dated transfers.
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
		}

		const current = periods.find((p) => !p.effectiveTo);
		if (!current) {
			throw new BadRequestException(
				'Ownership ledger không có period đang mở',
			);
		}
		if (input.effectiveDate <= current.effectiveFrom) {
			throw new BadRequestException(
				'Ngày chuyển asset phải sau ngày bắt đầu ownership hiện tại',
			);
		}
		if (input.revenueEffectiveFrom <= current.revenueEffectiveFrom) {
			throw new BadRequestException(
				'Tháng hiệu lực doanh thu phải sau period hiện tại',
			);
		}

		await manager.save(AssetOwnershipTransferEvent, {
			releaseId: release.id,
			fromTenantId: release.tenantId,
			fromLabelId: release.labelId ?? null,
			toTenantId: input.tenantId,
			toLabelId: input.labelId,
			effectiveDate: input.effectiveDate,
			revenueEffectiveFrom: input.revenueEffectiveFrom,
			source: 'asset_import',
			assetImportItemId: input.assetImportItemId ?? null,
			createdBy: input.actorId,
			note: input.note ?? null,
		});

		current.effectiveTo = input.effectiveDate;
		current.revenueEffectiveTo = input.revenueEffectiveFrom;
		await manager.save(current);
		await manager.save(
			manager.create(AssetOwnershipPeriod, {
				releaseId: release.id,
				tenantId: input.tenantId,
				labelId: input.labelId,
				effectiveFrom: input.effectiveDate,
				effectiveTo: null,
				revenueEffectiveFrom: input.revenueEffectiveFrom,
				revenueEffectiveTo: null,
				assetImportItemId: input.assetImportItemId ?? null,
				createdBy: input.actorId,
			}),
		);

		await manager.update(Release, release.id, {
			tenantId: input.tenantId,
			labelId: input.labelId,
			modifierId: input.actorId,
		});
		await this.enqueueSync(manager, release.id);
	}

	async recordInitialOwnership(
		manager: EntityManager,
		input: Omit<TransferAssetOwnershipInput, 'assetImportItemId'> & {
			assetImportItemId?: string | null;
		},
	): Promise<void> {
		this.assertDate(input.effectiveDate, 'effectiveDate');
		this.assertDate(input.revenueEffectiveFrom, 'revenueEffectiveFrom');
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
				revenueEffectiveFrom: input.revenueEffectiveFrom,
				revenueEffectiveTo: null,
				assetImportItemId: input.assetImportItemId ?? null,
				createdBy: input.actorId,
			}),
		);
		await this.enqueueSync(manager, input.releaseId);
	}

	private async enqueueSync(manager: EntityManager, releaseId: string) {
		await manager.query(
			`INSERT INTO clickhouse_sync_outbox (entity_name, entity_id, action, processed)
			 VALUES ('asset_ownership_periods', $1, 'UPDATE', FALSE)
			 ON CONFLICT (entity_name, entity_id) WHERE processed = FALSE
			 DO UPDATE SET created_at = CURRENT_TIMESTAMP, action = EXCLUDED.action, error_message = NULL`,
			[releaseId],
		);
		await manager.query(
			"SELECT pg_notify('clickhouse_sync_channel', 'asset_ownership_periods')",
		);
	}

	private assertDate(value: string, field: string) {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
			Number.isNaN(Date.parse(value))
		) {
			throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD`);
		}
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
