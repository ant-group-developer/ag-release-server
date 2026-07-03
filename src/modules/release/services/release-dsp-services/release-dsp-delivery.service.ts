// services/release-dsp-delivery.service.ts
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { TenantDspAgreementService } from 'src/modules/dsp/services/dsp-tenant.service';
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
import { ReleaseService } from '../release.service';
import { ReleaseDspDeliveryQueryService } from './release-dsp-delivery-query.service';

@Injectable()
export class ReleaseDspDeliveryService {
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
	) {}
	// ==================== Delivery orchestration ====================
	async updateDeliveryStatus(input: {
		releaseIds: string[];
		items: {
			id?: string;
			dspId?: string;
			dspCode: string;
			status?: ReleaseDspStatus;
		}[];
	}): Promise<void> {
		const { releaseIds } = input;
		const items = await this.resolveDeliveryStatusItems(input.items);

		if (!releaseIds.length || !items.length) return;

		const existingLiveVersionMap = await this.getExistingLiveVersionMap(
			releaseIds,
			items,
		);
		const now = new Date();
		const values = releaseIds.flatMap((releaseId) =>
			items.map((item) => ({
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
				lastEnqueuedAt:
					item.status === ReleaseDspStatus.PROCESSING ? now : null,
				lastDeliveredAt:
					item.status === ReleaseDspStatus.DISTRIBUTED ? now : null,
			})),
		);

		await this.repo
			.createQueryBuilder()
			.insert()
			.into(ReleaseDspDelivery)
			.values(values)
			.orUpdate(
				[
					'status',
					'is_selected',
					'has_live_version',
					'last_enqueued_at',
					'last_delivered_at',
				],
				['release_id', 'dsp_id'],
			)
			.execute();

		await Promise.all(
			[...new Set(releaseIds)].map((releaseId) =>
				this.releaseService.syncReleaseStatus(releaseId, input.items),
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
			dspCode?: string;
			status?: ReleaseDspStatus;
		}[],
	): Promise<{ dspId: string; status: ReleaseDspStatus }[]> {
		if (!items.length) return [];

		const dspCodes = [
			...new Set(
				items
					.filter((item) => !item.id && !item.dspId && item.dspCode)
					.map((item) => item.dspCode!),
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

		return items
			.map((item) => ({
				dspId: item.dspId,
				status: item.status ?? ReleaseDspStatus.ISSUES,
			}))
			.filter(
				(item): item is { dspId: string; status: ReleaseDspStatus } =>
					!!item.dspId,
			);
	}
}
