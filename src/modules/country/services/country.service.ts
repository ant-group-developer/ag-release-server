import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { AnalyticsCacheService } from 'src/modules/analytics/services/analytics-cache.service';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { Repository } from 'typeorm';

import { toCountryFlagImageUrl } from 'src/utils/country-flag-image-url.util';
import { CountryMessage } from '../constants/country.constant';
import {
	CreateCountryDto,
	QueryGetListCountryDto,
	UpdateCountryDto,
} from '../dto/country.dto';
import { Country } from '../entities/country.entity';
import { IContinentWithCountries } from '../interfaces/country.interface';
import { CountryQueryService } from './country.query.service';

function withImageUrl(country: Country): Country {
	country.imageUrl = toCountryFlagImageUrl(country.flagImageKey);
	return country;
}

@Injectable()
export class CountryService implements OnModuleInit {
	private readonly logger = new Logger(CountryQueryService.name);
	private listCountriesCache: Country[];

	constructor(
		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,

		private readonly countryQueryService: CountryQueryService,
		private readonly bucketR2Service: BucketR2Service,
		private readonly analyticsCache: AnalyticsCacheService,
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

		return withImageUrl(country);
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
			items: countries.map(withImageUrl),
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

	async syncFlags(force = false): Promise<{
		total: number;
		uploaded: number;
		skipped: number;
		failed: Array<{ iso2: string; error: string }>;
	}> {
		const countries = await this.countryRepo.find({
			select: ['id', 'iso2', 'flagImageKey'],
		});
		const result = {
			total: countries.length,
			uploaded: 0,
			skipped: 0,
			failed: [] as Array<{ iso2: string; error: string }>,
		};

		for (const country of countries) {
			const iso2 = country.iso2?.trim().toLowerCase();
			if (!iso2 || !/^[a-z]{2}$/.test(iso2)) {
				result.skipped += 1;
				result.failed.push({
					iso2: country.iso2 || '',
					error: 'Country ISO-2 code must contain exactly two letters',
				});
				continue;
			}
			if (!force && country.flagImageKey) {
				result.skipped += 1;
				continue;
			}

			try {
				const response = await fetch(
					'https://flagcdn.com/' + iso2 + '.svg',
					{ signal: AbortSignal.timeout(15_000) },
				);
				if (!response.ok) {
					throw new Error('FlagCDN returned HTTP ' + response.status);
				}
				const contentType = response.headers.get('content-type') || '';
				if (!contentType.includes('image/svg+xml')) {
					throw new Error(
						'FlagCDN returned unsupported content type: ' +
							(contentType || 'unknown'),
					);
				}
				const buffer = Buffer.from(await response.arrayBuffer());
				if (!buffer.toString('utf8', 0, 512).includes('<svg')) {
					throw new Error('FlagCDN response is not a valid SVG');
				}

				const key = 'flags/countries/' + iso2 + '.svg';
				await this.bucketR2Service.uploadBuffer({
					key,
					buffer,
					contentType: 'image/svg+xml',
					isPublic: true,
				});
				await this.countryRepo.update(country.id, { flagImageKey: key });
				result.uploaded += 1;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.warn('Unable to sync flag for ' + iso2 + ': ' + message);
				result.failed.push({ iso2, error: message });
			}
		}

		if (result.uploaded > 0) {
			await this.reloadCache();
			this.analyticsCache.clear();
		}
		return result;
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
