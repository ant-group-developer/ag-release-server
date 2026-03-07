import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Currency } from 'src/modules/currency/entities/currency.entity';
import { Repository } from 'typeorm';
import { PriceTierMessage } from '../constants/price-tiers.constant';
import { QueryGetListPriceTier } from '../dto/price-tier.dto';
import { PriceTier } from '../entities/price-tier.entity';
import { FieldOrderCurrency } from '../enum/price-tier.enum';

@Injectable()
export class PriceTierQueryService {
	constructor(
		@InjectRepository(PriceTier)
		private readonly priceTierRepo: Repository<PriceTier>,

		@InjectRepository(Currency)
		private readonly currencyRepo: Repository<Currency>,
	) {}

	// private
	private createQueryGetList(query: QueryGetListPriceTier) {
		const { skip, pageSize, fieldOrder, orderBy } = query;

		const qb = this.priceTierRepo
			.createQueryBuilder('priceTier')
			.leftJoin('priceTier.currency', 'currency')

			.select([
				'priceTier.id',
				'priceTier.code',
				'priceTier.amount',
				'priceTier.currencyId',
				'priceTier.isDefault',
				'priceTier.isActive',
				'priceTier.createdAt',
				'priceTier.updatedAt',
			])
			.addSelect(['currency.id', 'currency.name', 'currency.code']);

		if (fieldOrder === FieldOrderCurrency.CURRENCY_NAME) {
			qb.orderBy('currency.name', orderBy);
		} else {
			qb.orderBy(`priceTier.${fieldOrder}`, orderBy);
		}

		qb.skip(skip).take(pageSize);

		return qb;
	}

	// public
	async validateForeignKey({ currencyId }: { currencyId?: string }) {
		if (currencyId) {
			const currency = await this.currencyRepo.findOne({
				where: { id: currencyId },
			});
			if (!currency) {
				throw new ResponseError({
					...PriceTierMessage.CURRENCY_NOT_FOUND,
					messageWarning: `${PriceTierMessage.CURRENCY_NOT_FOUND.message}: ${currencyId}`,
				});
			}
		}
	}

	async getList(query: QueryGetListPriceTier) {
		const qb = this.createQueryGetList(query);

		return await qb.getManyAndCount();
	}

	async findOneWithCountRelation(id: string) {
		const query = this.priceTierRepo.createQueryBuilder('priceTier');

		// virtual
		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(track.id)')
				.from('tracks', 'track')
				.where('track.price_tier_id = priceTier.id');
		}, 'track_count');

		query.where('priceTier.id = :id', { id });

		const dataFromDb: {
			raw: {
				priceTier_id: string;
				track_count: string;
			}[];
			entities: PriceTier[];
		} = await query.getRawAndEntities();

		const priceTiers = this.assigneeVirtualColumn(dataFromDb);
		return priceTiers[0];
	}

	private assigneeVirtualColumn(dataFromDb: {
		raw: {
			priceTier_id: string;
			track_count: string;
		}[];
		entities: PriceTier[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.find(
				(item) => item.priceTier_id === entity.id,
			);

			entity.trackCount = Number(dataRaw?.track_count);
			return entity;
		});
	}

	validateDelete(priceTier: PriceTier) {
		if ((priceTier.trackCount ?? 0) > 0) {
			throw new ResponseError({
				...PriceTierMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				messageWarning:
					PriceTierMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACKS
						.message +
					': ' +
					priceTier.id,
			});
		}
	}

	async resetDefaultPriceTier() {
		await this.priceTierRepo
			.createQueryBuilder()
			.update()
			.set({ isDefault: false })
			.execute();
	}
}
