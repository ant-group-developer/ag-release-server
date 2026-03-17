import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { ArtistRoleMessage } from '../constants/artist-role.constant';
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
			.where('artistRole.id = :id', { id });

		return await queryBuilder.getOne();
	}

	// validate
	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { name },
			});

			if (artistRole) {
				throw new ResponseError(
					ArtistRoleMessage.DUPLICATE_NAME_ARTIST_ROLE,
				);
			}
		}

		if (code) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { code },
			});

			if (artistRole) {
				throw new ResponseError(
					ArtistRoleMessage.DUPLICATE_CODE_ARTIST_ROLE,
				);
			}
		}
	}
}
