import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { CurrencyMessage } from '../constants/currency.constant';
import { QueryGetListCurrencyDto } from '../dto/currency.dto';
import { Currency } from '../entities/currency.entity';

@Injectable()
export class CurrencyQueryService {
	constructor(
		@InjectRepository(Currency)
		private readonly currencyRepo: Repository<Currency>,
	) {}

	// private
	private async validateUnique({
		name,
		code,
	}: {
		name?: string;
		code?: string;
	}) {
		if (name) {
			const existByName = await this.currencyRepo.findOne({
				where: { name },
			});
			if (existByName) {
				throw new ResponseError({
					...CurrencyMessage.UNIQUE_CONSTRAINT,
					messageWarning: `${CurrencyMessage.UNIQUE_CONSTRAINT.messageCode}: name = ${name}`,
				});
			}
		}

		if (code) {
			const existByCode = await this.currencyRepo.findOne({
				where: { code },
			});
			if (existByCode) {
				throw new ResponseError({
					...CurrencyMessage.UNIQUE_CONSTRAINT,
					messageWarning: `${CurrencyMessage.UNIQUE_CONSTRAINT.messageCode}: name = ${name}`,
				});
			}
		}
	}

	private createQueryGetList(query: QueryGetListCurrencyDto) {
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

		const qb = this.currencyRepo.createQueryBuilder('currency');

		if (keyword) {
			qb.andWhere('currency.name ILIKE :keyword ', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				'currency.createdAt BETWEEN :startCreatedAt AND :endCreatedAt',
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				'currency.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt',
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		qb.orderBy(`currency.${fieldOrder}`, orderBy).skip(skip).take(pageSize);

		return qb;
	}

	// public
	async validateCreate({ name, code }: { name: string; code: string }) {
		await this.validateUnique({ name, code });
	}

	async validateUpdate({ name, code }: { name?: string; code?: string }) {
		await this.validateUnique({ name, code });
	}

	async getList(query: QueryGetListCurrencyDto) {
		const qb = this.createQueryGetList(query);
		return qb.getManyAndCount();
	}

	async findOneWithCountRelation(id: string) {
		const query = this.currencyRepo.createQueryBuilder('currency');

		// virtual
		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(price_tier.id)')
				.from('price_tiers', 'price_tier')
				.where('price_tier.currency_id = currency.id');
		}, 'price_tier_count');

		query.where('currency.id = :id', { id });

		const dataFromDb: {
			raw: {
				currency_id: string;
				price_tier_count: string;
			}[];
			entities: Currency[];
		} = await query.getRawAndEntities();

		const currencies = this.assigneeVirtualColumn(dataFromDb);
		return currencies[0];
	}

	validateDelete(currency: Currency) {
		if ((currency.priceTierCount ?? 0) > 0) {
			throw new ResponseError({
				...CurrencyMessage.CANNOT_DELETE_BECAUSE_LINKED_PRICE_TIERS,
				messageWarning:
					CurrencyMessage.CANNOT_DELETE_BECAUSE_LINKED_PRICE_TIERS
						.message +
					': ' +
					currency.id,
			});
		}
	}

	private assigneeVirtualColumn(dataFromDb: {
		raw: {
			currency_id: string;
			price_tier_count: string;
		}[];
		entities: Currency[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.find(
				(item) => item.currency_id === entity.id,
			);

			entity.priceTierCount = Number(dataRaw?.price_tier_count);
			return entity;
		});
	}
}
