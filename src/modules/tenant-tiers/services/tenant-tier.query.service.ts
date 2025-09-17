import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TenantTierMessage } from '../constants/tenant-tiers.constant';
import { QueryGetListTenantTierDto } from '../dto/tenant-tiers.dto';
import { TenantTier } from '../entities/tenant-tiers.entity';

@Injectable()
export class TenantTierQueryService {
	constructor(
		@InjectRepository(TenantTier)
		private readonly tenantTierRepo: Repository<TenantTier>,
	) {}

	private createQueryGetList(query: QueryGetListTenantTierDto) {
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
		} = query;

		const queryBuilder =
			this.tenantTierRepo.createQueryBuilder('tenantTier');

		if (keyword) {
			queryBuilder.andWhere(
				'(tenantTier.nameVi ILIKE :keyword OR tenantTier.nameEn ILIKE :keyword OR tenantTier.code ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`tenantTier.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`tenantTier.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`tenantTier.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

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
				throw new ResponseError(TenantTierMessage.DUPLICATE_NAME_VI);
		}
		if (nameEn) {
			const exist = await this.tenantTierRepo.findOne({
				where: { nameEn },
			});
			if (exist)
				throw new ResponseError(TenantTierMessage.DUPLICATE_NAME_EN);
		}
		if (code) {
			const exist = await this.tenantTierRepo.findOne({
				where: { code },
			});
			if (exist)
				throw new ResponseError(TenantTierMessage.DUPLICATE_CODE);
		}
	}
}
