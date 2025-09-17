import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { TenantTierMessage } from '../constants/tenant-tiers.constant';
import {
	CreateTenantTierDto,
	QueryGetListTenantTierDto,
	UpdateTenantTierDto,
} from '../dto/tenant-tiers.dto';
import { TenantTier } from '../entities/tenant-tiers.entity';
import { TenantTierQueryService } from './tenant-tier.query.service';

@Injectable()
export class TenantTierService {
	constructor(
		@InjectRepository(TenantTier)
		private readonly tenantTierRepo: Repository<TenantTier>,
		private readonly tenantTierQueryService: TenantTierQueryService,
	) {}

	async create(data: CreateTenantTierDto, userId: string) {
		const { nameVi, nameEn, code } = data;
		await this.tenantTierQueryService.validate({ nameVi, nameEn, code });

		const entity = this.tenantTierRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return await this.tenantTierRepo.save(entity);
	}

	async findOne(id: string): Promise<TenantTier> {
		const entity = await this.tenantTierRepo.findOne({ where: { id } });
		if (!entity) throw new ResponseError(TenantTierMessage.NOT_FOUND);
		return entity;
	}

	async getList(
		query: QueryGetListTenantTierDto,
	): Promise<PageDto<TenantTier>> {
		const { page, pageSize } = query;
		const [items, totalItems] =
			await this.tenantTierQueryService.getList(query);
		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.tenantTierRepo.find({
			select: ['id', 'code', 'nameVi', 'nameEn'],
			order: {
				nameEn: 'ASC',
			},
		});
	}

	async update(
		id: string,
		data: UpdateTenantTierDto,
		userId: string,
	): Promise<TenantTier> {
		const entity = await this.findOne(id);

		const { nameEn, nameVi, code } = data;

		if (nameVi && nameVi !== entity.nameVi)
			await this.tenantTierQueryService.validate({ nameVi });
		if (nameEn && nameEn !== entity.nameEn)
			await this.tenantTierQueryService.validate({ nameEn });
		if (code && code !== entity.code)
			await this.tenantTierQueryService.validate({ code });

		await this.tenantTierRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const entity = await this.findOne(id);
		await this.tenantTierRepo.delete(entity.id);
	}
}
