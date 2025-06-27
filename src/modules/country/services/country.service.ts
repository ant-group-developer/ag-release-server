import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import { COUNTRY_ERRORS } from '../constants/country.constants';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from '../dto/country.dto';
import { Country } from '../entities/country.entity';

@Injectable()
export class CountryService {
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) {}

	async create(createCountryDto: CreateCountryDto): Promise<Country> {
		await this.validate({ name: createCountryDto.name });

		const country = this.countryRepo.create(createCountryDto);
		return await this.countryRepo.save(country);
	}

	async findOne(id: string): Promise<Country> {
		const country = await this.countryRepo.findOne({ where: { id } });
		if (!country) {
			throw new ResponseError({
				message: 'Not found',
			});
		}

		return country;
	}

	async getList(query: QueryGetListCountryDto): Promise<PageDto<Country>> {
		const { page, pageSize, skip } = query;

		const [countries, totalItems] = await this.countryRepo.findAndCount({
			skip,
			take: pageSize,
			// relations: ['trackLanguages', 'releaseLanguages'],
		});

		return new PageDto({
			items: countries,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateCountryDto: UpdateCountryDto,
	): Promise<Country> {
		await this.validate({ name: updateCountryDto.name });

		await this.countryRepo.update(id, updateCountryDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.countryRepo.delete(id);
	}

	async validate({ name }: { name: string }) {
		if (name) {
			const artist = await this.countryRepo.findOne({ where: { name } });

			if (artist) {
				throw new ResponseError({
					message: 'Duplicate country name',
					messageCode: COUNTRY_ERRORS.duplicateNameCountry,
				});
			}
		}
	}
}
