import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
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
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		private readonly countryQueryService: CountryQueryService,
	) {}

	async onModuleInit() {
		await this.initData();
	}

	async initData() {
		// const dataInit = listCountriesInit;
		// const count = await this.countryRepo.count();
		// if (count === 0) {
		// 	const listEntities = this.countryRepo.create(dataInit);
		// 	await this.countryRepo.save(listEntities);
		// }
	}

	// create
	async create(createCountryDto: CreateCountryDto): Promise<Country> {
		await this.countryQueryService.validate({
			name: createCountryDto.name,
		});

		const country = this.countryRepo.create(createCountryDto);
		return await this.countryRepo.save(country);
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
				currentPage: page,
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
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const country = await this.findOneWithCountRelation(id);
		this.countryQueryService.validateDelete(country);
		await this.countryRepo.delete(id);
	}
}
