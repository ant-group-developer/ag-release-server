import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseMessageError } from '../constants/release.constant';
import { QueryGetListReleaseDto } from '../dto/release.dto';
import { Release } from '../entities/release.entity';

@Injectable()
export class ReleaseQbService {
	private mainAlias: string;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {
		this.mainAlias = 'release';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	createQueryGetList(query: QueryGetListReleaseDto) {
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

		const queryBuilder = this.releaseRepo.createQueryBuilder(
			this.mainAlias,
		);

		queryBuilder.leftJoinAndSelect('release.primaryGenre', 'primaryGenre');

		if (keyword) {
			queryBuilder.andWhere('release.title ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`release.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`release.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`release.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOne(id: string): Promise<Release> {
		const release = await this.releaseRepo.findOne({
			where: { id },
		});

		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return release;
	}

	async getDetail(id: string): Promise<Release> {
		const query = this.releaseRepo.createQueryBuilder(this.mainAlias);

		query.where('release.id = :id', {
			id,
		});

		query.leftJoinAndSelect('release.releaseCoverArt', 'releaseCoverArt');

		const release = await query.getOne();

		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return release;
	}
}
