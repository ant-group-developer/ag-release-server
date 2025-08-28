import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { DspMessage } from '../constants/dsp.constant';
import { QueryGetListDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';

@Injectable()
export class DspQueryService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	async findOne(id: string): Promise<Dsp> {
		const query = this.createQueryFindOne(id);

		const dsp = await query.getOne();

		if (!dsp) {
			throw new ResponseError(DspMessage.NOT_FOUND);
		}

		return dsp;
	}

	async getList(query: QueryGetListDspDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	private createQueryFindOne(id: string) {
		const qb = this.dspRepo
			.createQueryBuilder('dsp')
			.leftJoin('dsp.dspActions', 'dspAction')
			.leftJoin('dspAction.action', 'action');

		qb.where('dsp.id = :id', { id });

		qb.addSelect([
			'dspAction.id',
			'dspAction.dspId',
			'dspAction.actionId',
			'dspAction.isDefault',

			'action.id',
			'action.name',
			'action.code',
			'action.note',
		]);

		return qb;
	}

	private createQueryGetList(query: QueryGetListDspDto) {
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
			.loadRelationCountAndMap('dsp.releaseDspsCount', 'dsp.releaseDsps');

		queryBuilder
			.leftJoin('dsp.dspActions', 'dspAction')
			.leftJoin('dspAction.action', 'action');

		queryBuilder.addSelect([
			'dspAction.id',
			'dspAction.dspId',
			'dspAction.actionId',
			'dspAction.isDefault',

			'action.id',
			'action.name',
			'action.code',
			'action.note',
		]);

		return await queryBuilder.getOne();
	}

	// validate
	async validate({ name }: { name?: string }) {
		if (name) {
			const dsp = await this.dspRepo.findOne({
				where: { name },
			});

			if (dsp) {
				throw new ResponseError(DspMessage.DUPLICATE_NAME_DSP);
			}
		}
	}

	validateDelete(dsp: Dsp) {
		if ((dsp.releaseDspsCount ?? 0) > 0) {
			throw new ResponseError(
				DspMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
			);
		}
	}
}
