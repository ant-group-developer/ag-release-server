import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TenantTierResponse } from '../constants/tenant-tiers.constant';
import { QueryGetListTenantTierDto } from '../dto/tenant-tiers.dto';
import { TenantTier } from '../entities/tenant-tiers.entity';

@Injectable()
export class TenantTierQueryService {
	constructor(
		@InjectRepository(TenantTier)
		private readonly tenantTierRepo: Repository<TenantTier>,
	) {}

	async getList(query: QueryGetListTenantTierDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	async validate({
		nameVi,
		nameEn,
		code,
	}: {
		nameVi?: string;
		nameEn?: string;
		code?: string;
	}) {
		if (nameVi) {
			const exist = await this.tenantTierRepo.findOne({
				where: { nameVi },
			});
			if (exist)
				throw new ResponseError(TenantTierResponse.DUPLICATE_NAME_VI);
		}
		if (nameEn) {
			const exist = await this.tenantTierRepo.findOne({
				where: { nameEn },
			});
			if (exist)
				throw new ResponseError(TenantTierResponse.DUPLICATE_NAME_EN);
		}
		if (code) {
			const exist = await this.tenantTierRepo.findOne({
				where: { code },
			});
			if (exist)
				throw new ResponseError(TenantTierResponse.DUPLICATE_CODE);
		}
	}

	//private
	private createBaseQuery() {
		return this.tenantTierRepo.createQueryBuilder('tenantTier');
	}

	private createQueryGetList(filter: QueryGetListTenantTierDto) {
		const qb = this.createBaseQuery();
		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListTenantTierDto;
		qb: SelectQueryBuilder<TenantTier>;
	}) {
		const {
			keyword,
			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,
			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = filter;

		if (keyword) {
			qb.andWhere(
				'(tenantTier.nameVi ILIKE :keyword OR tenantTier.nameEn ILIKE :keyword OR tenantTier.code ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`tenantTier.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`tenantTier.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}
}
