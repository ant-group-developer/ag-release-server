import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CurrencyMessageCodeError,
	CurrencyMessageError,
	defaultCurrencies,
} from '../constants/currency.constant';
import {
	CreateCurrencyDto,
	QueryGetListCurrencyDto,
	UpdateCurrencyDto,
} from '../dto/currency.dto';
import { Currency } from '../entities/currency.entity';
import { CurrencyQueryService } from './currency.query.service';

@Injectable()
export class CurrencyService implements OnModuleInit {
	private readonly logger = new Logger(CurrencyService.name);

	constructor(
		@InjectRepository(Currency)
		private readonly currencyRepo: Repository<Currency>,

		private readonly currencyQueryService: CurrencyQueryService,
	) {}

	// init
	async onModuleInit() {
		await this.initCurrencies();
	}

	private async initCurrencies() {
		const count = await this.currencyRepo.count();

		if (count === 0) {
			this.logger.log(
				'Currency table is empty, initializing default currencies',
			);

			const entities = defaultCurrencies.map((currency) =>
				this.currencyRepo.create({
					name: currency.name,
					code: currency.code,
				}),
			);

			await this.currencyRepo.save(entities);

			this.logger.log('Default currencies inserted successfully');
		} else {
			this.logger.log(
				'Currency table already has data, skipping initialization',
			);
		}
	}

	// create
	async create(data: CreateCurrencyDto): Promise<Currency> {
		const { name, code } = data;
		await this.currencyQueryService.validateCreate({ name, code });

		const currency = this.currencyRepo.create(data);
		return await this.currencyRepo.save(currency);
	}

	// read
	async findOne(id: string): Promise<Currency> {
		const currency = await this.currencyRepo.findOne({ where: { id } });
		if (!currency)
			throw new ResponseError({
				message: CurrencyMessageError.NOT_FOUND,
				messageCode: CurrencyMessageCodeError.NOT_FOUND,
			});
		return currency;
	}

	async getList(query: QueryGetListCurrencyDto) {
		const { page, pageSize } = query;

		const [currencies, totalItems] =
			await this.currencyQueryService.getList(query);

		return new PageDto({
			items: currencies,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async update(id: string, data: UpdateCurrencyDto): Promise<Currency> {
		const { name, code } = data;

		const currency = await this.findOne(id);

		if (name && name !== currency.name) {
			await this.currencyQueryService.validateUpdate({ name });
			currency.name = name;
		}

		if (code && code !== currency.code) {
			await this.currencyQueryService.validateUpdate({ code });
			currency.code = code;
		}

		return await this.currencyRepo.save(currency);
	}

	// delete
	async delete(id: string): Promise<void> {
		const currency = await this.findOne(id);
		await this.currencyRepo.remove(currency);
	}
}
