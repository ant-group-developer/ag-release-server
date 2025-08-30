import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CurrencyMessage,
	dataInitCurrencies,
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
			this.logger.log('Initializing default currencies');
			const entities = this.currencyRepo.create(dataInitCurrencies);
			await this.currencyRepo.save(entities);
			this.logger.log('Default currencies inserted successfully');
		} else {
			this.logger.log(
				'Currency table already has data, skipping initialization',
			);
		}
	}

	// create
	async create(data: CreateCurrencyDto, userId: string): Promise<Currency> {
		const { name, code } = data;
		await this.currencyQueryService.validateCreate({ name, code });

		const currency = this.currencyRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.currencyRepo.save(currency);
	}

	// read
	async findOne(id: string): Promise<Currency> {
		const currency = await this.currencyRepo.findOne({ where: { id } });
		if (!currency) throw new ResponseError(CurrencyMessage.NOT_FOUND);
		return currency;
	}

	async findOneWithCountRelation(id: string) {
		const currency =
			await this.currencyQueryService.findOneWithCountRelation(id);

		if (!currency) {
			throw new ResponseError({ message: 'Currency not found' });
		}

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

	async getListSimple() {
		return await this.currencyRepo.find({ select: ['id', 'code', 'name'] });
	}

	// update
	async update(
		id: string,
		data: UpdateCurrencyDto,
		userId: string,
	): Promise<Currency> {
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

		return await this.currencyRepo.save({
			...currency,
			modifierId: userId,
		});
	}

	// delete
	async delete(id: string): Promise<void> {
		const currency = await this.findOneWithCountRelation(id);
		this.currencyQueryService.validateDelete(currency);
		await this.currencyRepo.delete(id);
	}
}
