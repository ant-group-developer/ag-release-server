import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	ArtistRoleMessageCodeError,
	ArtistRoleMessageError,
} from '../constants/artist-role.constant';
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

	// validate
	validateDelete(artistRole: ArtistRole) {
		if ((artistRole.releaseCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					ArtistRoleMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					ArtistRoleMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}

		if ((artistRole.trackCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					ArtistRoleMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				messageCode:
					ArtistRoleMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				statusCode: 400,
			});
		}
	}

	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { name },
			});

			if (artistRole) {
				throw new ResponseError({
					message: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
					messageCode:
						ArtistRoleMessageCodeError.DUPLICATE_NAME_ARTIST_ROLE,
					statusCode: 409,
				});
			}
		}

		if (code) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { code },
			});

			if (artistRole) {
				throw new ResponseError({
					message: ArtistRoleMessageError.DUPLICATE_CODE_ARTIST_ROLE,
					messageCode:
						ArtistRoleMessageCodeError.DUPLICATE_CODE_ARTIST_ROLE,
					statusCode: 409,
				});
			}
		}
	}
}
