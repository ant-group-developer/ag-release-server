import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListCountryDto } from '../dto/country.dto';
import { Country } from '../entities/country.entity';
import { IContinentWithCountries } from '../interfaces/country.interface';

@Injectable()
export class CountryQueryService {
	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) { }

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

}
