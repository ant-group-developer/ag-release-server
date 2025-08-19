import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CurrencyMessageCodeError,
	CurrencyMessageError,
} from '../constants/currency.constant';
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
					message: CurrencyMessageError.UNIQUE_CONSTRAINT,
					messageCode: CurrencyMessageCodeError.UNIQUE_CONSTRAINT,
					messageWarning: `${CurrencyMessageError.UNIQUE_CONSTRAINT}: name = ${name}`,
					statusCode: 409,
				});
			}
		}

		if (code) {
			const existByCode = await this.currencyRepo.findOne({
				where: { code },
			});
			if (existByCode) {
				throw new ResponseError({
					message: CurrencyMessageError.UNIQUE_CONSTRAINT,
					messageCode: CurrencyMessageCodeError.UNIQUE_CONSTRAINT,
					messageWarning: `${CurrencyMessageError.UNIQUE_CONSTRAINT}: code = ${code}`,
					statusCode: 409,
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
}
