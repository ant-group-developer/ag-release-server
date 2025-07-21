import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListArtistRoleDto } from '../dto/artist-role.dto';
import { ArtistRole } from '../entities/artist-role.entity';

@Injectable()
export class ArtistRoleQueryService {
	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,
	) {}

	createQueryGetList(query: QueryGetListArtistRoleDto) {
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

		const queryBuilder =
			this.artistRoleRepo.createQueryBuilder('artistRole');

		queryBuilder
			.leftJoinAndSelect('artistRole.trackArtists', 'trackArtists')
			.leftJoinAndSelect('artistRole.releaseArtists', 'releaseArtists');

		if (keyword) {
			queryBuilder.andWhere('artistRole.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`artistRole.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`artistRole.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`artistRole.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.artistRoleRepo
			.createQueryBuilder('artistRole')
			.where('artistRole.id = :id', { id })

			.loadRelationCountAndMap(
				'artistRole.releaseCount',
				'artistRole.releaseArtists',
			)
			.loadRelationCountAndMap(
				'artistRole.trackCount',
				'artistRole.trackArtists',
			);

		return await queryBuilder.getOne();
	}
}
