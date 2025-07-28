import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import {
	CountryMessageCodeError,
	CountryMessageError,
} from '../constants/country.constant';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from '../dto/country.dto';
import { Country } from '../entities/country.entity';
import { IContinentWithCountries } from '../interfaces/country.interface';
import { CountryQueryService } from './country.query.service';

@Injectable()
export class CountryService {
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		private readonly countryQueryService: CountryQueryService,
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
				message: CountryMessageError.NOT_FOUND,
				statusCode: 404,
			});
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

	async update(
		id: string,
		updateCountryDto: UpdateCountryDto,
	): Promise<Country> {
		const country = await this.findOne(id);
		if (country?.name !== updateCountryDto.name) {
			await this.validate({ name: updateCountryDto.name });
		}

		await this.countryRepo.update(id, updateCountryDto);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const country =
			await this.countryQueryService.findOneWithCountRelation(id);
		if (!country) {
			throw new ResponseError({
				message: CountryMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		if ((country.releaseMetadataLanguageCountriesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
				messageCode:
					CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((country.trackMetadataLanguageCountriesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
				messageCode:
					CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((country.trackRecordingCountriesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					CountryMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS,
				messageCode:
					CountryMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS,
				statusCode: 400,
			});
		}

		await this.countryRepo.delete(id);
	}

	async validate({ name }: { name?: string }) {
		if (name) {
			const artist = await this.countryRepo.findOne({ where: { name } });

			if (artist) {
				throw new ResponseError({
					message: CountryMessageError.DUPLICATE_NAME_COUNTRY,
					messageCode: CountryMessageCodeError.DUPLICATE_NAME_COUNTRY,
					statusCode: 409,
				});
			}
		}
	}
}
