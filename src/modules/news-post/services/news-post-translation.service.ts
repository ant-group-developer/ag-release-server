import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { NewsPostTranslationResponse } from '../constants/news-post-translation.constant';
import { CreateNewsPostTranslationDto } from '../dto/news-post-translation.dto';
import { UpdateTranslation } from '../dto/news-post.dto';
import { NewsPostTranslation } from '../entities/news-post-translation.entity';

@Injectable()
export class NewsPostTranslationService {
	constructor(
		@InjectRepository(NewsPostTranslation)
		private readonly newsPostTranslationRepo: Repository<NewsPostTranslation>,
	) {}

	async create({
		newsPostId,
		languageCode,
		title,
		description,
		content,
		isDefault,
		userId,
	}: CreateNewsPostTranslationDto): Promise<NewsPostTranslation> {
		if (isDefault) {
			await this.newsPostTranslationRepo.update(
				{ newsPostId },
				{ isDefault: false },
			);
		}

		const entity = this.newsPostTranslationRepo.create({
			newsPostId,
			languageCode,
			title,
			description,
			content,
			isDefault: isDefault ?? false,
			creatorId: userId,
			modifierId: userId,
		});

		return await this.newsPostTranslationRepo.save(entity);
	}

	async listOfNewsPost(newsPostId: string) {
		const qb = this.createBaseQb();
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.andWhereNewsPostId({ qb, newsPostId });

		this.addSelectLanguage(qb);
		this.addSelectCreator(qb);
		this.addSelectModifier(qb);

		const entities = await qb.getMany();

		return entities.map((item) => this.assigneLanguageNameOne(item));
	}

	private andWhereNewsPostId({
		newsPostId,
		qb,
	}: {
		newsPostId: string;
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		if (newsPostId) {
			qb.andWhere('newsPostTranslation.newsPostId = :newsPostId', {
				newsPostId,
			});
		}
	}
	async findOne(id: string) {
		const entity = await this.newsPostTranslationRepo.findOne({
			where: { id },
		});

		if (!entity) {
			throw new ResponseError(NewsPostTranslationResponse.NOT_FOUND);
		}

		return entity;
	}

	private assigneLanguageNameOne(
		entity: NewsPostTranslation,
	): NewsPostTranslation {
		const { language } = entity;

		entity.language = undefined;
		entity.languageName = language?.name;

		return entity;
	}

	async update(data: UpdateTranslation) {
		const { userId, ...rest } = data;
		await this.newsPostTranslationRepo.save({
			...rest,
			modifierId: userId,
		});
	}

	async delete(id: string) {
		await this.newsPostTranslationRepo.delete({ id });
	}

	// private validate({ languageCode }: { languageCode?: string }) {}

	// query service
	private createBaseQb() {
		return this.newsPostTranslationRepo.createQueryBuilder(
			'newsPostTranslation',
		);
	}

	private leftJoinUserTracked(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinCreator(qb);
		this.leftJoinModifier(qb);
	}

	private leftJoinCreator(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.creator';
		const alias = 'creator';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinModifier(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.modifier';
		const alias = 'modifier';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinLanguage(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.language';
		const alias = 'language';

		qb.leftJoin(property, alias);
	}

	private addSelectLanguage(qb: SelectQueryBuilder<NewsPostTranslation>) {
		qb.addSelect(['language.id', 'language.name', 'language.code']);
	}

	private addSelectCreator(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinCreator(qb);
		qb.addSelect(['creator.id', 'creator.name', 'creator.email']);
	}

	private addSelectModifier(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinModifier(qb);
		qb.addSelect(['modifier.id', 'modifier.name', 'modifier.email']);
	}

	private leftJoinSafe({
		qb,
		property,
		alias,
	}: {
		qb: SelectQueryBuilder<NewsPostTranslation>;
		property: string;
		alias: string;
	}) {
		const isJoined = qb.expressionMap.joinAttributes.some(
			(j) => j.alias?.name === alias,
		);

		if (!isJoined) {
			qb.leftJoin(property, alias);
		}
	}
}
