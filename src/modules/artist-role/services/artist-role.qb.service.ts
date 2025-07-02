import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListArtistRoleDto } from '../dto/artist-role.dto';
import { ArtistRole } from '../entities/artist-role.entity';

@Injectable()
export class ArtistRoleQbService {
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

		if (keyword) {
			queryBuilder.andWhere('artistRole.name LIKE :keyword', {
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
}
