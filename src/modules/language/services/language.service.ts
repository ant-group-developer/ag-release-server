import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	LanguageMessageCodeError,
	LanguageMessageError,
} from '../constants/language.constant';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from '../dto/language.dto';
import { Language } from '../entities/language.entity';
import { LanguageQbService } from './language.qb.service';

@Injectable()
export class LanguageService {
	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		private readonly languageQbService: LanguageQbService,
	) {}

	async create(createLanguageDto: CreateLanguageDto): Promise<Language> {
		const { code, name } = createLanguageDto;

		await this.validate({ code, name });

		const language = this.languageRepo.create(createLanguageDto);
		return await this.languageRepo.save(language);
	}

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

		const queryGetList = this.languageQbService.createQueryGetList(query);

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

	async update(
		id: string,
		updateLanguageDto: UpdateLanguageDto,
	): Promise<Language> {
		const { code, name } = updateLanguageDto;
		const language = await this.findOne(id);

		if (language.code !== code) {
			await this.validate({ code });
		}

		if (language.name !== name) {
			await this.validate({ name });
		}

		await this.languageRepo.update(id, updateLanguageDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.languageRepo.delete(id);
	}

	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const language = await this.languageRepo.findOne({
				where: { name },
			});

			if (language) {
				throw new ResponseError({
					message: LanguageMessageError.DUPLICATE_NAME_LANGUAGE,
					messageCode:
						LanguageMessageCodeError.DUPLICATE_NAME_LANGUAGE,
					statusCode: 409,
				});
			}
		}

		if (code) {
			const language = await this.languageRepo.findOne({
				where: { code },
			});

			if (language) {
				throw new ResponseError({
					message: LanguageMessageError.DUPLICATE_CODE_LANGUAGE,
					messageCode:
						LanguageMessageCodeError.DUPLICATE_CODE_LANGUAGE,
					statusCode: 409,
				});
			}
		}
	}
}
