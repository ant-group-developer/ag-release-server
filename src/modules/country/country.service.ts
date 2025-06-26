import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from './dto/country.dto';
import { Country } from './entities/country.entity';

@Injectable()
export class CountryService {
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) {}

	async create(createCountryDto: CreateCountryDto): Promise<Country> {
		const country = this.countryRepo.create(createCountryDto);
		return await this.countryRepo.save(country);
	}

	async findOne(id: string): Promise<Country> {
		const country = await this.countryRepo.findOne({ where: { id } });
		if (!country) {
			throw new BadRequestException('Not found');
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
			metaData: {
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
		await this.countryRepo.update(id, updateCountryDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.countryRepo.delete(id);
	}
}
