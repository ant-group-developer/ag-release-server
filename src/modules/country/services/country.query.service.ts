import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { CountryMessage } from '../constants/country.constant';
import { QueryGetListCountryDto } from '../dto/country.dto';
import { Country } from '../entities/country.entity';
import { IContinentWithCountries } from '../interfaces/country.interface';

@Injectable()
export class CountryQueryService {
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) {}

	createQueryGetList(query: QueryGetListCountryDto) {
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

		const queryBuilder = this.countryRepo.createQueryBuilder('country');

		if (keyword) {
			queryBuilder.andWhere('country.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`country.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`country.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`country.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getListContinent(): Promise<IContinentWithCountries[]> {
		const result: IContinentWithCountries[] = [];

		const countries = await this.countryRepo
			.createQueryBuilder('country')
			.select(['country.continent AS continent', 'country.name AS name'])
			.orderBy('country.continent')
			.addOrderBy('country.name')
			.getRawMany<{ continent: string; name: string }>();

		const map = new Map<string, string[]>();

		for (const { continent, name } of countries) {
			if (!map.has(continent)) {
				map.set(continent, []);
			}
			map.get(continent)!.push(name);
		}

		for (const [continent, countryList] of map.entries()) {
			result.push({
				continentName: continent,
				countries: countryList,
			});
		}

		return result;
	}

	async getListSimple() {
		return this.countryRepo
			.createQueryBuilder('c')
			.select(['c.id', 'c.name', 'c.iso2'])
			.getMany();
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.countryRepo
			.createQueryBuilder('country')
			.where('country.id = :id', { id })

			.loadRelationCountAndMap(
				'country.releaseMetadataLanguageCountriesCount',
				'country.releaseMetadataLanguageCountries',
			)
			.loadRelationCountAndMap(
				'country.trackMetadataLanguageCountriesCount',
				'country.trackMetadataLanguageCountries',
			)
			.loadRelationCountAndMap(
				'country.trackRecordingCountriesCount',
				'country.trackRecordingCountries',
			);

		return await queryBuilder.getOne();
	}

	async validate({ name }: { name?: string }) {
		if (name) {
			const artist = await this.countryRepo.findOne({ where: { name } });

			if (artist) {
				throw new ResponseError(CountryMessage.DUPLICATE_NAME_COUNTRY);
			}
		}
	}

	validateDelete(country: Country) {
		if ((country.releaseMetadataLanguageCountriesCount ?? 0) > 0) {
			throw new ResponseError(
				CountryMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
			);
		}

		if ((country.trackMetadataLanguageCountriesCount ?? 0) > 0) {
			throw new ResponseError(
				CountryMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
			);
		}

		if ((country.trackRecordingCountriesCount ?? 0) > 0) {
			throw new ResponseError(
				CountryMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACK_RECORDINGS,
			);
		}
	}
}
