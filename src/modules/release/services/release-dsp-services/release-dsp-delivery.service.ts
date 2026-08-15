// services/release-dsp-delivery.service.ts
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { TenantDspAgreementService } from 'src/modules/dsp/services/dsp-tenant.service';
import {
	CiDspStatus,
	CiExportService,
} from 'src/modules/partners-api/ci/services/ci-export.service';
import { EntityManager, In, Repository } from 'typeorm';
import { ReleaseDspDeliveryException } from '../../constants/release-dsp.constant';
import { ReleaseException } from '../../constants/release.constant';
import {
	CreateReleaseDspDeliveryDto,
	GetListReleaseDspDeliveriesDto,
	UpdateReleaseDspDeliveryDto,
} from '../../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../../entities/release-dsp-delivery.entity';
import { Release } from '../../entities/release.entity';
import { ReleaseDspStatus } from '../../enum/release-dsp.enum';
import { TakedownEligibilityResult } from '../../interfaces/takedown.interface';
import { ReleaseService } from '../release.service';
import { ReleaseDspDeliveryQueryService } from './release-dsp-delivery-query.service';

type SyncStatusSkipReason = 'STALE_DESIRE';

@Injectable()
export class ReleaseDspDeliveryService {
	private readonly logger = new Logger(ReleaseDspDeliveryService.name);

	constructor(
		@InjectRepository(ReleaseDspDelivery)
		private readonly repo: Repository<ReleaseDspDelivery>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly queryService: ReleaseDspDeliveryQueryService,

		private readonly tenantDspAgreementService: TenantDspAgreementService,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@Inject(forwardRef(() => ReleaseService))
		private readonly releaseService: ReleaseService,

		private readonly ciExportService: CiExportService,
	) {}
	// ==================== Delivery orchestration ====================

	async resolveTakedownEligibleDspCodes(
		releaseId: string,
		dspCodes: string[],
	): Promise<TakedownEligibilityResult> {
		const uniqueCodes = [...new Set(dspCodes)];
		if (!uniqueCodes.length) return { eligibleCodes: [], skipped: [] };

		const deliveries = await this.repo.find({
			where: {
				releaseId,
				dsp: { code: In(uniqueCodes) },
			},
			relations: ['dsp'],
		});

		const deliveryByCode = new Map(
			deliveries.map((delivery) => [delivery.dsp.code, delivery]),
		);
		const eligibleCodes: string[] = [];
		const skipped: TakedownEligibilityResult['skipped'] = [];

		for (const code of uniqueCodes) {
			const delivery = deliveryByCode.get(code);
			if (!delivery) {
				skipped.push({ code, reason: 'DELIVERY_NOT_FOUND' });
				continue;
			}
			if (delivery.status === ReleaseDspStatus.TAKEN_DOWN) {
				skipped.push({ code, reason: 'ALREADY_TAKEN_DOWN' });
				continue;
			}
			if (!delivery.hasLiveVersion) {
				skipped.push({ code, reason: 'NO_LIVE_VERSION' });
				continue;
			}
			eligibleCodes.push(code);
		}

		return { eligibleCodes, skipped };
	}

	async updateDeliveryStatus(input: {
		releaseIds: string[];
		items: {
			id?: string;
			dspId?: string;
			dspCode: string;
			status: ReleaseDspStatus;
			deliveredAt?: Date | null;
		}[];
		stampLastEnqueuedAt?: boolean;
	}): Promise<void> {
		const { releaseIds } = input;
		const items = await this.resolveDeliveryStatusItems(input.items);

		if (!releaseIds.length || !items.length) return;

		const existingLiveVersionMap = await this.getExistingLiveVersionMap(
			releaseIds,
			items,
		);

		const now = new Date();
		const values = releaseIds.flatMap((releaseId) => {
			return items.map((item) => ({
				releaseId,
				dspId: item.dspId,
				status: item.status,
				isSelected: true,
				hasLiveVersion: this.resolveHasLiveVersion(
					item.status,
					existingLiveVersionMap.get(
						this.getDeliveryKey(releaseId, item.dspId),
					) ?? false,
				),
				// ...(item.status === ReleaseDspStatus.PROCESSING
				// 	? { lastEnqueuedAt: now }
				// 	: {}),
				lastDeliveredAt: item?.deliveredAt ?? null,
			}));
		});

		await this.repo
			.createQueryBuilder()
			.insert()
			.into(ReleaseDspDelivery)
			.values(values)
			.orUpdate(
				[
					'status',
					// 'is_selected',
					'has_live_version',
					// 'last_enqueued_at',
					'last_delivered_at',
				],
				['release_id', 'dsp_id'],
			)
			.execute();

		// Nếu là processing update ngày hiện tại còn không giữ nguyên.
		// CI sync truyền stampLastEnqueuedAt=false để không đẩy clock
		// qua desire cũ và kẹt các lần sync sau.
		if (input.stampLastEnqueuedAt !== false) {
			const processingDspIds = [
				...new Set(
					values
						.filter(
							(item) =>
								item.status === ReleaseDspStatus.PROCESSING,
						)
						.map((item) => item.dspId),
				),
			];

			if (processingDspIds.length) {
				await this.repo.update(
					{
						releaseId: In(releaseIds),
						dspId: In(processingDspIds),
					},
					{ lastEnqueuedAt: now },
				);
			}
		}

		await Promise.all(
			[...new Set(releaseIds)].map((releaseId) =>
				this.releaseService.syncReleaseStatus(releaseId),
			),
		);
	}

	async upsertProcessing(releaseId: string, dspId: string): Promise<void> {
		const existed = await this.repo.findOne({
			where: { releaseId, dspId },
		});

		const data = {
			status: ReleaseDspStatus.PROCESSING,
			lastEnqueuedAt: new Date(),
			lastDeliveredAt: null as Date | null,
			hasLiveVersion: existed?.hasLiveVersion ?? false,
			isSelected: true,
		};

		if (!existed) {
			await this.repo.save({ releaseId, dspId, ...data });
		} else {
			await this.repo.update({ releaseId, dspId }, data);
		}
	}

	async markDistributed(releaseId: string, dspId: string): Promise<void> {
		await this.repo.update(
			{ releaseId, dspId },
			{
				status: ReleaseDspStatus.DISTRIBUTED,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: new Date(),
				hasLiveVersion: true,
			},
		);
	}

	async markIssues(releaseId: string, dspId: string): Promise<void> {
		await this.repo.update(
			{ releaseId, dspId },
			{
				status: ReleaseDspStatus.ISSUES,
				lastEnqueuedAt: new Date(),
				lastDeliveredAt: null,
			},
		);
	}

	async updateMetadataInfo(
		releaseId: string,
		dspId: string,
		info: { metadataPath?: string; batchId?: string },
	): Promise<void> {
		await this.repo.update({ releaseId, dspId }, info);
	}

	async syncLiveVersionFromCiExportData(
		releaseIds: string[],
	): Promise<number> {
		const uniqueReleaseIds = [...new Set(releaseIds)].filter(Boolean);
		if (!uniqueReleaseIds.length) return 0;

		return this.repo.manager.transaction(async (manager) => {
			// 1. Upsert has_live_version cho các dsp CÓ xuất hiện trong export mới
			const upsertRows = await manager.query(
				`
				INSERT INTO "release_dsp_delivery" (
					"release_id",
					"dsp_id",
					"has_live_version"
				)
				SELECT
					ci_export."release_id",
					dsp."id",
					bool_or(
						lower(coalesce(ci_export."delivery_point_status", '')) IN ('live', 'transferred')
					)
				FROM (
					SELECT
						rcd."release_id",
						export_item."value" ->> 'deliveryPointStatus' AS "delivery_point_status",
						coalesce(
							nullif(trim(export_item."value" ->> 'deliveryPointCode'), ''),
							nullif(trim(substring(
								export_item."value" ->> 'deliveryPoint'
								FROM '\\(([^()]*)\\)\\s*$'
							)), '')
						) AS "delivery_point_code"
					FROM "release_ci_data" rcd
					INNER JOIN LATERAL jsonb_array_elements(
						coalesce(rcd."export_parsed_data", '[]'::jsonb)
					) AS export_item("value") ON true
					WHERE rcd."release_id" = ANY($1::uuid[])
				) ci_export
				INNER JOIN "dsps" dsp
					ON upper(trim(dsp."code_ci")) =
						upper(trim(ci_export."delivery_point_code"))
				WHERE dsp."code_ci" IS NOT NULL
				AND ci_export."delivery_point_code" IS NOT NULL
				GROUP BY
					ci_export."release_id",
					dsp."id"
				ON CONFLICT ("release_id", "dsp_id")
				DO UPDATE SET
					"has_live_version" = EXCLUDED."has_live_version"
				RETURNING "id"
				`,
				[uniqueReleaseIds],
			);

			// 2. Set false cho dsp đang live cũ nhưng KHÔNG còn xuất hiện trong export mới
			const downRows = await manager.query(
				`
				UPDATE "release_dsp_delivery" rdd
				SET "has_live_version" = false
				FROM "dsp_routing_configs" routing
				INNER JOIN "aggregators" aggregator
					ON aggregator."id" = routing."aggregator_id"
				WHERE rdd."dsp_id" = routing."dsp_id"
				AND routing."mode" = 'aggregator'
				AND routing."is_active" = true
				AND upper(trim(aggregator."code")) = 'CI'
				AND rdd."release_id" = ANY($1::uuid[])
				AND rdd."has_live_version" = true
				AND NOT EXISTS (
					SELECT 1
					FROM (
						SELECT
							rcd."release_id",
							coalesce(
								nullif(trim(export_item."value" ->> 'deliveryPointCode'), ''),
								nullif(trim(substring(
									export_item."value" ->> 'deliveryPoint'
									FROM '\\(([^()]*)\\)\\s*$'
								)), '')
							) AS "delivery_point_code"
						FROM "release_ci_data" rcd
						INNER JOIN LATERAL jsonb_array_elements(
							coalesce(rcd."export_parsed_data", '[]'::jsonb)
						) AS export_item("value") ON true
						WHERE rcd."release_id" = ANY($1::uuid[])
					) ci_export
					INNER JOIN "dsps" dsp2
						ON upper(trim(dsp2."code_ci")) = upper(trim(ci_export."delivery_point_code"))
					WHERE ci_export."release_id" = rdd."release_id"
					AND dsp2."id" = rdd."dsp_id"
				)
				RETURNING rdd."id"
				`,
				[uniqueReleaseIds],
			);

			const syncedCount = upsertRows.length + downRows.length;
			this.logger.log(
				`syncLiveVersionFromCiExportData affected: ${syncedCount} (up: ${upsertRows.length}, down: ${downRows.length})`,
			);

			return syncedCount;
		});
	}

	async updateSelected(releaseId: string, dspIds: string[]): Promise<void> {
		await this.repo.update({ releaseId }, { isSelected: false });

		if (dspIds.length > 0) {
			await this.repo.update(
				{ releaseId, dspId: In(dspIds) },
				{ isSelected: true },
			);
		}
	}

	async getAndSyncReleaseDspDeliveries(
		releaseId: string,
		query: GetListReleaseDspDeliveriesDto,
	) {
		// Lấy tenantId của release
		// để resolve danh sách DSP được phép phân phối
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			select: ['tenantId'],
		});

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		// Lấy danh sách DSP agreement của tenant
		// bao gồm cả DSP mặc định hệ thống
		const agreements = await this.tenantDspAgreementService.tenantGetDsps(
			release.tenantId,
		);

		// Đồng bộ release_dsp_delivery với agreements hiện tại
		// đồng thời trả về danh sách delivery sau sync
		const dataPage = await this.queryService.getAndSyncReleaseDspDeliveries(
			releaseId,
			query,
			agreements,
		);

		// Các DSP đã bị disable nhưng vẫn đang selected
		// sẽ tự động bỏ chọn để tránh tiếp tục delivery
		const bulkDeselect = dataPage.items
			.filter((item) => !item.isActive && item.isSelected)
			.map((item) => ({
				id: item.id,
				isSelected: false,
			}));

		// Bulk update trạng thái deselect
		if (bulkDeselect.length) {
			await this.bulkUpdate({
				data: {
					items: bulkDeselect,
				},
			});
		}

		return dataPage;
	}

	async ensureDeliveriesExist(
		releaseId: string,
		activeDspIds: string[],
	): Promise<void> {
		const existing = await this.repo.find({
			where: { releaseId },
			select: ['dspId'],
		});

		const existIds = new Set(existing.map((d) => d.dspId));

		const newRecords = activeDspIds
			.filter((id) => !existIds.has(id))
			.map((dspId) => ({
				releaseId,
				dspId,
				status: ReleaseDspStatus.NEVER_DISTRIBUTED,
				hasLiveVersion: false,
				lastEnqueuedAt: null as Date | null,
				lastDeliveredAt: null as Date | null,
			}));

		if (newRecords.length) {
			await this.repo.insert(newRecords);
		}
	}

	async findReleaseDspDeliveryId(
		releaseId: string,
		dspId: string,
	): Promise<string | null> {
		const record = await this.repo.findOne({
			where: { releaseId, dspId },
			select: ['id'],
		});
		return record?.id ?? null;
	}

	// crud
	async bulkUpdate(input: {
		data: {
			items: {
				id: string;
				[key: string]: any;
			}[];
		};
		manager?: EntityManager;
	}) {
		const { data, manager } = input;
		const repo = this.getRepo(manager);

		await repo.save(data.items);

		return true;
	}

	async create(input: {
		data: CreateReleaseDspDeliveryDto;

		manager?: EntityManager;
	}) {
		const { data, manager } = input;
		const repo = this.getRepo(manager);

		await this.validateUnique(data, manager);

		const entity = repo.create({
			...data,
		});

		return repo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOneBy({ id });
		if (!entity) throw ReleaseDspDeliveryException.NOT_FOUND();
		return entity;
	}

	async update(input: {
		id: string;
		data: UpdateReleaseDspDeliveryDto;
		manager?: EntityManager;
	}) {
		const { id, data, manager } = input;
		const repo = this.getRepo(manager);

		await this.findOne(id);

		// unique check only when releaseId + dspId both provided in update
		if (data.releaseId && data.dspId) {
			await this.validateUnique(
				{ releaseId: data.releaseId, dspId: data.dspId },
				manager,
				id,
			);
		}

		await repo.update(id, {
			...data,
		});

		return this.findOne(id);
	}

	async getList(filter: GetListReleaseDspDeliveriesDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
	}

	// private
	private async validateUnique(
		data: Pick<CreateReleaseDspDeliveryDto, 'releaseId' | 'dspId'>,
		manager?: EntityManager,
		excludeId?: string,
	) {
		const repo = this.getRepo(manager);
		const existed = await repo.findOne({
			where: {
				releaseId: data.releaseId,
				dspId: data.dspId,
			},
		});

		if (existed && existed.id !== excludeId) {
			throw ReleaseDspDeliveryException.DUPLICATED();
		}
	}

	protected getRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(ReleaseDspDelivery) : this.repo;
	}

	private async getExistingLiveVersionMap(
		releaseIds: string[],
		items: { dspId: string; status: ReleaseDspStatus }[],
	): Promise<Map<string, boolean>> {
		const existing = await this.repo.find({
			where: {
				releaseId: In(releaseIds),
				dspId: In(items.map((item) => item.dspId)),
			},
			select: ['releaseId', 'dspId', 'hasLiveVersion'],
		});

		return new Map(
			existing.map((delivery) => [
				this.getDeliveryKey(delivery.releaseId, delivery.dspId),
				delivery.hasLiveVersion,
			]),
		);
	}

	private getDeliveryKey(releaseId: string, dspId: string) {
		return `${releaseId}:${dspId}`;
	}

	private resolveHasLiveVersion(
		status: ReleaseDspStatus,
		currentHasLiveVersion: boolean,
	) {
		if (status === ReleaseDspStatus.DISTRIBUTED) return true;
		if (
			status === ReleaseDspStatus.TAKEN_DOWN ||
			status === ReleaseDspStatus.NEVER_DISTRIBUTED
		) {
			return false;
		}

		return currentHasLiveVersion;
	}

	private async resolveDeliveryStatusItems(
		items: {
			id?: string;
			dspId?: string;
			dspCode: string;
			status: ReleaseDspStatus;
			deliveredAt?: Date | null;
		}[],
	): Promise<
		{ dspId: string; status: ReleaseDspStatus; deliveredAt: Date | null }[]
	> {
		if (!items.length) return [];

		const dspCodes = [
			...new Set(
				items
					.filter((item) => !item.id && !item.dspId && item.dspCode)
					.map((item) => item.dspCode),
			),
		];

		const dspCodeToId = new Map<string, string>();
		if (dspCodes.length) {
			const dsps = await this.dspRepo.find({
				where: { code: In(dspCodes) },
				select: ['id', 'code'],
			});

			for (const dsp of dsps) {
				dspCodeToId.set(dsp.code, dsp.id);
			}
		}

		const result = items
			.map((item) => ({
				dspId:
					item.dspId ??
					(item.dspCode ? dspCodeToId.get(item.dspCode) : undefined),
				// status: item.status ?? ReleaseDspStatus.ISSUES,
				status: item.status,
				deliveredAt: item.deliveredAt,
			}))
			.filter(
				(
					item,
				): item is {
					dspId: string;
					status: ReleaseDspStatus;
					deliveredAt: Date | null;
				} => !!item.dspId,
			);
		return result;
	}

	private async getDeliveryGateMap(
		releaseId: string,
		dspIds: string[],
	): Promise<Map<string, { lastEnqueuedAt: Date | null }>> {
		if (!dspIds.length) return new Map();

		const deliveries = await this.repo.find({
			where: { releaseId, dspId: In(dspIds) },
			select: ['dspId', 'lastEnqueuedAt'],
		});

		return new Map(
			deliveries.map((delivery) => [
				delivery.dspId,
				{ lastEnqueuedAt: delivery.lastEnqueuedAt },
			]),
		);
	}

	/**
	 * Sync status từ CI API:
	 * 1. Lấy status mới nhất từ CI theo release_ci_data.release_format_id
	 * 2. Chỉ apply khi desireDate >= lastEnqueuedAt của từng DSP
	 * 3. Map CI status -> ReleaseDspStatus
	 * 4. Update release_dsp_delivery (không stamp lastEnqueuedAt)
	 * 5. Update release.status
	 */
	async syncStatusFromCi(releaseId: string) {
		// 1. Lấy releaseFormatId từ CI

		const releaseFormatId = await this.releaseService.getReleaseFormatId(
			releaseId,
			{ reloadFromCi: false },
		);

		// 2. Lấy status từ CI
		const ciStatuses = await this.ciExportService.getStatusDsps({
			releaseFormatId,
		});

		this.logger.log(
			`[syncStatusFromCi] releaseId=${releaseId}, CI trả về ${ciStatuses.length} DSPs`,
		);

		if (!ciStatuses.length) {
			return {
				releaseId,
				message: 'Không có DSP nào từ CI',
				updated: 0,
			};
		}

		// 3. CI returns musicService.dpc, which maps to Dsp.codeCi (not Dsp.code).
		// Resolve the internal DSP first so updateDeliveryStatus receives a dspId.
		const normalizedCiCodes = [
			...new Set(
				ciStatuses
					.map((item) => item.ciCode?.trim().toLowerCase())
					.filter((code): code is string => !!code),
			),
		];
		const dsps = normalizedCiCodes.length
			? await this.dspRepo
					.createQueryBuilder('dsp')
					.select(['dsp.id', 'dsp.code', 'dsp.codeCi'])
					.where('LOWER(dsp.codeCi) IN (:...ciCodes)', {
						ciCodes: normalizedCiCodes,
					})
					.getMany()
			: [];
		const dspByCodeCi = new Map(
			dsps
				.filter((dsp) => !!dsp.codeCi)
				.map((dsp) => [dsp.codeCi!.trim().toLowerCase(), dsp]),
		);

		const mappedCandidates = ciStatuses.flatMap((ciStatus) => {
			const dsp = dspByCodeCi.get(ciStatus.ciCode?.trim().toLowerCase());

			if (!dsp) {
				this.logger.warn(
					`[syncStatusFromCi] DSP not found for CI code=${ciStatus.ciCode}`,
				);
				return [];
			}

			return [
				{
					dspId: dsp.id,
					dspCode: dsp.code,
					ciStatus,
				},
			];
		});

		const gateMap = await this.getDeliveryGateMap(
			releaseId,
			mappedCandidates.map((item) => item.dspId),
		);

		const applied: {
			dspId: string;
			dspCode: string;
			status: ReleaseDspStatus;
			deliveredAt: Date | null;
		}[] = [];
		const skipped: {
			dspCode: string;
			reason: SyncStatusSkipReason;
			detail: Record<string, unknown>;
		}[] = [];
		const staleLiveDspIds = new Set<string>();

		for (const item of mappedCandidates) {
			const mappedStatus =
				this.releaseService.mapCiDspStatusToReleaseDspStatus(
					item.ciStatus,
				);
			const skipReason = this.resolveCiSyncSkipReason({
				ciStatus: item.ciStatus,
				lastEnqueuedAt: gateMap.get(item.dspId)?.lastEnqueuedAt ?? null,
			});

			if (skipReason) {
				// A stale CI result must not overwrite the status of the current
				// execution. It can still confirm that an older/live version exists.
				if (mappedStatus === ReleaseDspStatus.DISTRIBUTED) {
					staleLiveDspIds.add(item.dspId);
				}

				skipped.push({
					dspCode: item.dspCode,
					reason: skipReason.reason,
					detail: { ...skipReason.detail, mappedStatus },
				});
				this.logger.log(
					`[syncStatusFromCi] SKIP reason=${skipReason.reason} ` +
						`releaseId=${releaseId} dsp=${item.dspCode} ` +
						`desireDate=${item.ciStatus.desireDate?.toISOString() ?? 'null'} ` +
						`lastEnqueuedAt=${
							gateMap.get(item.dspId)?.lastEnqueuedAt
								? new Date(
										gateMap.get(item.dspId)!
											.lastEnqueuedAt!,
									).toISOString()
								: 'null'
						}`,
				);
				continue;
			}

			applied.push({
				dspId: item.dspId,
				dspCode: item.dspCode,
				status: mappedStatus,
				deliveredAt: item.ciStatus.deliveredAt,
			});
		}

		let liveVersionRestored = 0;
		if (staleLiveDspIds.size) {
			const result = await this.repo.update(
				{
					releaseId,
					dspId: In([...staleLiveDspIds]),
				},
				{ hasLiveVersion: true },
			);
			liveVersionRestored = result.affected ?? 0;
		}

		if (applied.length) {
			await this.updateDeliveryStatus({
				releaseIds: [releaseId],
				items: applied,
				stampLastEnqueuedAt: false,
			});
		} else {
			this.logger.log(
				`[syncStatusFromCi] releaseId=${releaseId}: nothing to apply ` +
					`(skipped=${skipped.length})`,
			);
		}

		const updatedRelease = await this.releaseRepo.findOne({
			where: { id: releaseId },
			select: ['id', 'status'],
		});

		return {
			releaseId,
			releaseStatus: updatedRelease?.status,
			applied: applied.length,
			skipped: skipped.length,
			liveVersionRestored,
			skippedItems: skipped,
			ciStatuses,
		};
	}

	private resolveCiSyncSkipReason(input: {
		ciStatus: CiDspStatus;
		lastEnqueuedAt: Date | null;
	}): {
		reason: SyncStatusSkipReason;
		detail: Record<string, unknown>;
	} | null {
		if (input.lastEnqueuedAt) {
			const desireMs = input.ciStatus.desireDate?.getTime() ?? 0;
			const enqueuedMs = new Date(input.lastEnqueuedAt).getTime();
			if (!desireMs || desireMs < enqueuedMs) {
				return {
					reason: 'STALE_DESIRE',
					detail: {
						desireDate: input.ciStatus.desireDate,
						lastEnqueuedAt: input.lastEnqueuedAt,
					},
				};
			}
		}

		return null;
	}
}
