import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { LanguageMessageError } from '../constants/language.constant';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from '../dto/language.dto';
import { Language } from '../entities/language.entity';
import { LanguageQueryService } from './language.query.service';

@Injectable()
export class LanguageService {
	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		private readonly languageQueryService: LanguageQueryService,
	) {}

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
			throw new ResponseError({
				message: LanguageMessageError.NOT_FOUND,
				statusCode: 404,
			});
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
			throw new ResponseError({
				message: LanguageMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		this.languageQueryService.validateDelete(language);

		await this.languageRepo.delete(id);
	}
}
