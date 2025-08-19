import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	PriceTierMessageCodeError,
	PriceTierMessageError,
} from '../constants/price-tiers.constant';
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

	async create(dto: CreatePriceTierDto): Promise<PriceTier> {
		await this.priceTierQueryService.validateForeignKey({
			currencyId: dto.currencyId,
		});

		if (dto.isDefault === true) {
			await this.priceTierQueryService.resetDefaultPriceTier();
		}

		const entity = this.priceTierRepo.create(dto);
		return this.priceTierRepo.save(entity);
	}

	// read
	async findOne(id: string): Promise<PriceTier> {
		const priceTier = await this.priceTierRepo.findOne({ where: { id } });
		if (!priceTier) {
			throw new ResponseError({
				message: PriceTierMessageError.NOT_FOUND,
				messageCode: PriceTierMessageCodeError.NOT_FOUND,
				messageWarning: `${PriceTierMessageError.NOT_FOUND}: ${id}`,
				statusCode: 404,
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
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async update(id: string, dto: UpdatePriceTierDto): Promise<PriceTier> {
		const entity = await this.findOne(id);
		await this.priceTierQueryService.validateForeignKey({
			currencyId: dto.currencyId,
		});

		if (dto?.isDefault === true && dto.isDefault !== entity.isDefault) {
			await this.priceTierQueryService.resetDefaultPriceTier();
		}

		Object.assign(entity, dto);
		return this.priceTierRepo.save(entity);
	}

	async delete(id: string): Promise<void> {
		const priceTier = await this.findOneWithCountRelation(id);
		this.priceTierQueryService.validateDelete(priceTier);
		await this.priceTierRepo.delete(id);
	}
}
