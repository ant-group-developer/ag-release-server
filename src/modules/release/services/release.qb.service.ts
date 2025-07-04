import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseMessageError } from '../constants/release.constant';
import { QueryGetListReleaseDto } from '../dto/release.dto';
import { Release } from '../entities/release.entity';

@Injectable()
export class ReleaseQbService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

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

		const queryBuilder = this.releaseRepo.createQueryBuilder('release');

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

	// async saveToDatabase(data: IRelease) {
	// 	const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

	// 	await this.releaseValidateService.validate({
	// 		labelId,
	// 		primaryGenreId,
	// 		subGenreId,
	// 		releaseTimezoneId,
	// 	});

	// 	const release = this.releaseRepo.create(createReleaseDto);
	// 	return await this.releaseRepo.save(release);
	// }
}
