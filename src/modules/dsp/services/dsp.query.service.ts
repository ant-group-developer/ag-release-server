import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	DspMessageCodeError,
	DspMessageError,
} from '../constants/dsp.constant';
import { QueryGetListDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';

@Injectable()
export class DspQueryService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	createQueryGetList(query: QueryGetListDspDto) {
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

		const queryBuilder = this.dspRepo.createQueryBuilder('dsp');

		if (keyword) {
			queryBuilder.andWhere('dsp.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`dsp.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`dsp.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`dsp.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.dspRepo
			.createQueryBuilder('dsp')
			.where('dsp.id = :id', { id })
			.loadRelationCountAndMap(
				'dsp.organizationDspsCount',
				'dsp.organizationDsps',
			)
			.loadRelationCountAndMap('dsp.releaseDspsCount', 'dsp.releaseDsps');

		return await queryBuilder.getOne();
	}

	// validate
	async validate({ name }: { name?: string }) {
		if (name) {
			const dsp = await this.dspRepo.findOne({
				where: { name },
			});

			if (dsp) {
				throw new ResponseError({
					message: DspMessageError.DUPLICATE_NAME_DSP,
					messageCode: DspMessageCodeError.DUPLICATE_NAME_DSP,
					statusCode: 409,
				});
			}
		}
	}

	validateDelete(dsp: Dsp) {
		if ((dsp.organizationDspsCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					DspMessageError.CANNOT_DELETE_BECAUSE_LINKED_ORGANIZATIONS,
				messageCode:
					DspMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_ORGANIZATIONS,
				statusCode: 400,
			});
		}

		if ((dsp.releaseDspsCount ?? 0) > 0) {
			throw new ResponseError({
				message: DspMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					DspMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}
	}
}
