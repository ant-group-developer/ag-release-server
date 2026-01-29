import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { PriceTierMessage } from '../constants/price-tiers.constant';
import {
	CreatePriceTierDto,
	QueryGetListPriceTier,
	UpdatePriceTierDto,
} from '../dto/price-tier.dto';
import { PriceTier } from '../entities/price-tier.entity';
import { PriceTierQueryService } from './price-tier.query.service';

@Injectable()
export class PriceTierService {
	constructor(
		@InjectRepository(PriceTier)
		private readonly priceTierRepo: Repository<PriceTier>,

		private readonly priceTierQueryService: PriceTierQueryService,
	) {}

	async create(dto: CreatePriceTierDto, userId: string): Promise<PriceTier> {
		await this.priceTierQueryService.validateForeignKey({
			currencyId: dto.currencyId,
		});

		if (dto.isDefault === true) {
			await this.priceTierQueryService.resetDefaultPriceTier();
		}

		const entity = this.priceTierRepo.create({
			...dto,
			creatorId: userId,
			modifierId: userId,
		});
		return this.priceTierRepo.save(entity);
	}

	// read
	async findOne(id: string): Promise<PriceTier> {
		const priceTier = await this.priceTierRepo.findOne({ where: { id } });
		if (!priceTier) {
			throw new ResponseError({
				...PriceTierMessage.NOT_FOUND,
				messageWarning: `${PriceTierMessage.NOT_FOUND.message}: ${id}`,
			});
		}
		return priceTier;
	}

	async findOneWithCountRelation(id: string) {
		const priceTier =
			await this.priceTierQueryService.findOneWithCountRelation(id);

		if (!priceTier) {
			throw new ResponseError({ message: 'Price tier not found' });
		}

		return priceTier;
	}

	async getList(query: QueryGetListPriceTier) {
		const { page, pageSize } = query;

		const [items, totalItems] =
			await this.priceTierQueryService.getList(query);

		return new PageDto({
			items,
			metadata: { page: page, pageSize, totalItems },
		});
	}

	async update(
		id: string,
		dto: UpdatePriceTierDto,
		userId: string,
	): Promise<PriceTier> {
		const entity = await this.findOne(id);
		await this.priceTierQueryService.validateForeignKey({
			currencyId: dto.currencyId,
		});

		if (dto?.isDefault === true && dto.isDefault !== entity.isDefault) {
			await this.priceTierQueryService.resetDefaultPriceTier();
		}

		Object.assign(entity, { ...dto, modifierId: userId });
		return this.priceTierRepo.save(entity);
	}

	async delete(id: string): Promise<void> {
		const priceTier = await this.findOneWithCountRelation(id);
		this.priceTierQueryService.validateDelete(priceTier);
		await this.priceTierRepo.delete(id);
	}
}
