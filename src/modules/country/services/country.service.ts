import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';

import { CountryMessage } from '../constants/country.constant';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from '../dto/country.dto';
import { Country } from '../entities/country.entity';
import { IContinentWithCountries } from '../interfaces/country.interface';
import { CountryQueryService } from './country.query.service';

@Injectable()
export class CountryService implements OnModuleInit {
	private readonly logger = new Logger(CountryQueryService.name);
	private listCountriesCache: Country[];

	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		private readonly countryQueryService: CountryQueryService,
	) {}

	async onModuleInit() {
		// await this.initData();
		await this.reloadCache();
	}

	async initData() {
		// const dataInit = listCountriesInit;
		// const count = await this.countryRepo.count();
		// if (count === 0) {
		// 	const listEntities = this.countryRepo.create(dataInit);
		// 	await this.countryRepo.save(listEntities);
		// }
	}

	async reloadCache() {
		this.listCountriesCache = await this.countryRepo
			.createQueryBuilder('c')
			.select(['c.id', 'c.name', 'c.iso2'])
			.getMany();

		this.logger.log(
			`Country cache loaded: ${this.listCountriesCache.length} records`,
		);
	}

	// create
	async create(createCountryDto: CreateCountryDto): Promise<Country> {
		await this.countryQueryService.validate({
			name: createCountryDto.name,
		});

		const country = this.countryRepo.create(createCountryDto);

		const result = await this.countryRepo.save(country);

		this.reloadCache().catch((_e) => {});
		return result;
	}

	// read
	async findOne(id: string): Promise<Country> {
		const country = await this.countryRepo.findOne({ where: { id } });
		if (!country) {
			throw new ResponseError(CountryMessage.NOT_FOUND);
		}

		return country;
	}

	private async findOneWithCountRelation(id: string): Promise<Country> {
		const country =
			await this.countryQueryService.findOneWithCountRelation(id);
		if (!country) {
			throw new ResponseError(CountryMessage.NOT_FOUND);
		}

		return country;
	}

	async getList(query: QueryGetListCountryDto): Promise<PageDto<Country>> {
		const { page, pageSize } = query;

		const queryGetList = this.countryQueryService.createQueryGetList(query);

		const [countries, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: countries,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListContinent(): Promise<IContinentWithCountries[]> {
		return await this.countryQueryService.getListContinent();
	}

	async getListSimple() {
		return this.countryQueryService.getListSimple();
	}

	getListSimpleCache() {
		return this.listCountriesCache;
	}

	// update
	async update(
		id: string,
		updateCountryDto: UpdateCountryDto,
	): Promise<Country> {
		const country = await this.findOne(id);
		if (country?.name !== updateCountryDto.name) {
			await this.countryQueryService.validate({
				name: updateCountryDto.name,
			});
		}

		await this.countryRepo.update(id, updateCountryDto);
		const result = await this.findOne(id);

		this.reloadCache().catch((_e) => {});
		return result;
	}

	// delete
	async delete(id: string): Promise<void> {
		const country = await this.findOneWithCountRelation(id);
		this.countryQueryService.validateDelete(country);
		await this.countryRepo.delete(id);

		this.reloadCache().catch((_e) => {});
	}
}
