import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	CreateLanguageDto,
	QueryGetListLanguageDto,
	UpdateLanguageDto,
} from './dto/language.dto';
import { Language } from './entities/language.entity';

@Injectable()
export class LanguageService {
	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,
	) {}

	async create(createLanguageDto: CreateLanguageDto): Promise<Language> {
		const language = this.languageRepo.create(createLanguageDto);
		return await this.languageRepo.save(language);
	}

	async findOne(id: string): Promise<Language> {
		const language = await this.languageRepo.findOne({ where: { id } });
		if (!language) {
			throw new BadRequestException('Not found');
		}

		return language;
	}

	async getList(query: QueryGetListLanguageDto): Promise<PageDto<Language>> {
		const { page, pageSize, skip } = query;

		const [languages, totalItems] = await this.languageRepo.findAndCount({
			skip,
			take: pageSize,
		});

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
		await this.languageRepo.update(id, updateLanguageDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.languageRepo.delete(id);
	}
}
