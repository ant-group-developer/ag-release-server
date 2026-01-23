// src/modules/distribution/dsp-release-status/services/dsp-release-status.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDspReleaseStatusesDto } from '../dto/dsp-release-status.dto';
import { DspReleaseStatus } from '../entities/dsp-release-status.entity';

@Injectable()
export class DspReleaseStatusQueryService {
	constructor(
		@InjectRepository(DspReleaseStatus)
		private readonly repo: Repository<DspReleaseStatus>,
	) {}

	async getList(filter: GetListDspReleaseStatusesDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				pageSize,
				currentPage: page,
				totalItems,
			},
		});
	}

	private createQbGetList(filter: GetListDspReleaseStatusesDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.dspReleaseStatus);

		qb.leftJoinAndSelect('dspReleaseStatus.dsp', 'dsp')
			.leftJoinAndSelect('dsp.dspRoutingSetting', 'dspRoutingSetting')
			.leftJoinAndSelect('dspRoutingSetting.directConfig', 'directConfig')
			.leftJoinAndSelect(
				'dspRoutingSetting.specificAggregatorConfig',
				'specificAggregatorConfig',
			);

		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DspReleaseStatus>;
		filter: GetListDspReleaseStatusesDto;
	}) {
		const alias = OrmAlias.dspReleaseStatus ?? 'dspReleaseStatus';
		const { dspId, releaseId, status, keyword } = filter;

		if (dspId) qb.andWhere(`${alias}.dspId = :dspId`, { dspId });
		if (releaseId)
			qb.andWhere(`${alias}.releaseId = :releaseId`, { releaseId });
		if (status) qb.andWhere(`${alias}.status = :status`, { status });

		if (keyword?.length) {
			qb.andWhere(
				`(
                    ${alias}.dspId ILIKE ANY(:keywords)
                    OR ${alias}.releaseId ILIKE ANY(:keywords)
                )`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({ qb, filter });
	}
}
