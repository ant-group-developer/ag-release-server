import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { AlbumFormatMessage } from '../constant/album-format.constant';
import { QueryGetListAlbumFormatDto } from '../dto/album-format.dto';
import { AlbumFormat } from '../entities/album-format.entity';

@Injectable()
export class AlbumFormatQueryService {
	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,
	) {}

	private createQueryGetList(query: QueryGetListAlbumFormatDto) {
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
			this.albumFormatRepo.createQueryBuilder('albumFormat');

		if (keyword) {
			queryBuilder.andWhere('albumFormat.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`albumFormat.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`albumFormat.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`albumFormat.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListAlbumFormatDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.albumFormatRepo
			.createQueryBuilder('albumFormat')
			.where('albumFormat.id = :id', { id })

			.loadRelationCountAndMap(
				'albumFormat.releasesCount',
				'albumFormat.releases',
			);

		return await queryBuilder.getOne();
	}

	// validate
	async validate({
		name,
		code,
	}: {
		name?: string;
		code?: string;
	}): Promise<void> {
		if (name) {
			const existingName = await this.albumFormatRepo.findOne({
				where: { name },
			});

			if (existingName) {
				throw new ResponseError(
					AlbumFormatMessage.DUPLICATE_NAME_ALBUM_FORMAT,
				);
			}
		}

		if (code) {
			const existingValue = await this.albumFormatRepo.findOne({
				where: { code },
			});

			if (existingValue) {
				throw new ResponseError(
					AlbumFormatMessage.DUPLICATE_CODE_ALBUM_FORMAT,
				);
			}
		}
	}

	validateDelete(albumFormat: AlbumFormat) {
		if (!albumFormat) {
			throw new ResponseError(AlbumFormatMessage.NOT_FOUND);
		}

		if ((albumFormat?.releasesCount ?? 0) > 0) {
			throw new ResponseError(
				AlbumFormatMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
			);
		}
	}

	async getListSimple() {
		return this.albumFormatRepo
			.createQueryBuilder('albumFormat')
			.addSelect([
				'albumFormat.id',
				'albumFormat.name',
				'albumFormat.code',
			])
			.getMany();
	}
}
