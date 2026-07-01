// services/release-dsp-delivery-query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { TenantDspAgreement } from 'src/modules/dsp/entities/dsp-tenant.entity';
import { TenantDspAgreementService } from 'src/modules/dsp/services/dsp-tenant.service';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ReleaseException } from '../../constants/release.constant';
import { GetListReleaseDspDeliveriesDto } from '../../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../../entities/release-dsp-delivery.entity';
import { Release } from '../../entities/release.entity';
import { ReleaseDspStatus } from '../../enum/release-dsp.enum';

@Injectable()
export class ReleaseDspDeliveryQueryService {
	constructor(
		@InjectRepository(ReleaseDspDelivery)
		private readonly repo: Repository<ReleaseDspDelivery>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		private readonly tenantDspAgreementService: TenantDspAgreementService,
	) {}

	// async getAndSyncReleaseDspDeliveries(
	// 	releaseId: string,
	// 	query: GetListReleaseDspDeliveriesDto,
	// ) {
	// 	await this.syncMissingDeliveries(releaseId);
	// 	query.releaseId = releaseId;
	// 	return this.getList(query);
	// }

	// async getAndSyncReleaseDspDeliveries(
	// 	releaseId: string,
	// 	query: GetListReleaseDspDeliveriesDto,
	// ) {
	// 	await this.syncMissingDeliveries(releaseId);
	// 	query.releaseId = releaseId;

	// 	const release = await this.releaseRepo.findOne({
	// 		where: { id: releaseId },
	// 		select: ['tenantId'],
	// 	});

	// 	if (!release) {
	// 		throw ReleaseException.NOT_FOUND();
	// 	}

	// 	const [dataPage, agreements] = await Promise.all([
	// 		this.getList(query),
	// 		this.tenantDspAgreementService.tenantGetDsps(release.tenantId),
	// 	]);

	// 	const agreementMap = new Map(agreements.map((a) => [a.dspId, a]));

	// 	dataPage.items = dataPage.items.map((item) => ({
	// 		...item,
	// 		isActive: agreementMap.get(item.dspId)?.isActive ?? false,
	// 	}));

	// 	return dataPage;
	// }

	async getAndSyncReleaseDspDeliveries(
		releaseId: string,
		query: GetListReleaseDspDeliveriesDto,
		agreements: TenantDspAgreement[],
	) {
		await this.syncMissingDeliveries(releaseId);
		query.releaseId = releaseId;

		const agreementMap = new Map(agreements.map((a) => [a.dspId, a]));

		const dataPage = await this.getList(query);

		dataPage.items = dataPage.items.map((item) => ({
			...item,
			isActive: agreementMap.get(item.dspId)?.isActive ?? false,
		}));

		return dataPage;
	}

	private async syncMissingDeliveries(releaseId: string) {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			select: ['tenantId'],
		});
		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		const dsps = (
			await this.tenantDspAgreementService.tenantGetDsps(release.tenantId)
		).map((a) => a.dsp);

		const existDeliveries = await this.repo.find({
			where: { releaseId },
			select: ['dspId'],
		});

		const existDspIds = new Set(existDeliveries.map((d) => d.dspId));

		const newRecords = dsps
			.filter((dsp) => !existDspIds.has(dsp.id))
			.map((dsp) => ({
				releaseId,
				dspId: dsp.id,
				isSelected: false,
				status: ReleaseDspStatus.NEVER_DISTRIBUTED,
				hasLiveVersion: false,
				lastEnqueuedAt: null,
				lastDeliveredAt: null,
			}));

		if (newRecords.length) {
			await this.repo
				.createQueryBuilder()
				.insert()
				.into(ReleaseDspDelivery)
				.values(newRecords)
				.orIgnore()
				.execute();
		}
	}

	async getList(filter: GetListReleaseDspDeliveriesDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	private createQbGetList(filter: GetListReleaseDspDeliveriesDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.releaseDspDelivery);
		qb.leftJoinAndSelect(`${OrmAlias.releaseDspDelivery}.dsp`, 'dsp');
		this.applyFilter(qb, filter);
		return qb;
	}

	private applyFilter(
		qb: SelectQueryBuilder<ReleaseDspDelivery>,
		filter: GetListReleaseDspDeliveriesDto,
	) {
		const { releaseId, dspId, status, keyword } = filter;

		if (releaseId) {
			qb.andWhere(
				`${OrmAlias.releaseDspDelivery}.releaseId = :releaseId`,
				{ releaseId },
			);
		}

		if (dspId) {
			qb.andWhere(`${OrmAlias.releaseDspDelivery}.dspId = :dspId`, {
				dspId,
			});
		}

		if (status) {
			qb.andWhere(`${OrmAlias.releaseDspDelivery}.status = :status`, {
				status,
			});
		}

		if (keyword?.length) {
			qb.andWhere(
				'(dsp.name ILIKE ANY(:keywords) OR dsp.code ILIKE ANY(:keywords))',
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({
			qb,
			filter,
		});
	}
}
