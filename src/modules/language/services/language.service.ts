import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	dataInitLanguage,
	LanguageMessage,
} from '../constants/language.constant';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from '../dto/language.dto';
import { Language } from '../entities/language.entity';
import { LanguageQueryService } from './language.query.service';

@Injectable()
export class LanguageService implements OnModuleInit {
	private readonly logger = new Logger(LanguageService.name);

	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		private readonly languageQueryService: LanguageQueryService,
	) {}

	async onModuleInit() {
		await this.initLanguage();
	}

	private async initLanguage() {
		const count = await this.languageRepo.count();

		if (count === 0) {
			this.logger.log('Initializing language');

			const insertData = this.languageRepo.create(dataInitLanguage);
			await this.languageRepo.save(insertData);

			this.logger.log('Languages inserted successfully');
		} else {
			this.logger.log(
				'Languages table already has data, skipping initialization',
			);
		}
	}

	// create
	async create(createLanguageDto: CreateLanguageDto): Promise<Language> {
		const { code, name } = createLanguageDto;

		await this.languageQueryService.validate({ code, name });

		const language = this.languageRepo.create(createLanguageDto);
		return await this.languageRepo.save(language);
	}

	// read
	async findOne(id: string): Promise<Language> {
		const language = await this.languageRepo.findOne({ where: { id } });
		if (!language) {
			throw new ResponseError(LanguageMessage.NOT_FOUND);
		}

		return language;
	}

	async getList(query: QueryGetListLanguageDto): Promise<PageDto<Language>> {
		const { page, pageSize } = query;

		const queryGetList =
			this.languageQueryService.createQueryGetList(query);

		const [languages, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: languages,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple() {
		return this.languageQueryService.getListSimple();
	}

	// update
	async update(
		id: string,
		updateLanguageDto: UpdateLanguageDto,
	): Promise<Language> {
		const { code, name } = updateLanguageDto;
		const language = await this.findOne(id);

		if (language.code !== code) {
			await this.languageQueryService.validate({ code });
		}

		if (language.name !== name) {
			await this.languageQueryService.validate({ name });
		}

		await this.languageRepo.update(id, updateLanguageDto);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const language =
			await this.languageQueryService.findOneWithCountRelation(id);
		if (!language) {
			throw new ResponseError(LanguageMessage.NOT_FOUND);
		}

		this.languageQueryService.validateDelete(language);

		await this.languageRepo.delete(id);
	}
}
