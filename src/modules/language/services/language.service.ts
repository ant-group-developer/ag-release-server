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
import { LanguageQueryService } from './language.query.service';

@Injectable()
export class LanguageService {
	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		private readonly languageQueryService: LanguageQueryService,
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

	async delete(id: string): Promise<void> {
		const language =
			await this.languageQueryService.findOneWithCountRelation(id);
		if (!language) {
			throw new ResponseError({
				message: LanguageMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		if ((language.releaseLocalizesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_LOCALIZES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_LOCALIZES,
				statusCode: 400,
			});
		}

		if ((language.releaseAudiolanguagesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_AUDIO_LANGUAGES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_AUDIO_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((language.releaseMetadataLanguagesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((language.trackAudioLanguagesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_AUDIO_LANGUAGES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_AUDIO_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((language.trackMetadataLanguagesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
				statusCode: 400,
			});
		}

		if ((language.trackLocalizesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LanguageMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_LOCALIZES,
				messageCode:
					LanguageMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACK_LOCALIZES,
				statusCode: 400,
			});
		}

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
