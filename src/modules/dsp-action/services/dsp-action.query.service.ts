import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Action } from 'src/modules/action/entities/action.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Repository } from 'typeorm';
import {
	DspActionMessageCodeError,
	DspActionMessageError,
} from '../constants/dsp-action.constant';
import { DspAction } from '../entities/dsp-action.entities';
import { QueryGetListDspActionDto } from '../interface/dsp-action.interface';

@Injectable()
export class DspActionQueryService {
	constructor(
		@InjectRepository(DspAction)
		private readonly dspActionRepo: Repository<DspAction>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		@InjectRepository(Action)
		private readonly actionRepo: Repository<Action>,
	) {}

	async validateCreate({
		dspId,
		actionId,
	}: {
		dspId: string;
		actionId: string;
	}) {
		await Promise.all([
			this.validateForeignKey({ dspId, actionId }),
			this.validateUnique({ dspId, actionId }),
		]);
	}

	async validateUpdate({
		dspActionDb,
		dataUpdate,
	}: {
		dspActionDb: DspAction;
		dataUpdate: {
			dspId?: string;
			actionId?: string;
		};
	}) {
		const { dspId, actionId } = dataUpdate;
		await this.validateForeignKey({ dspId, actionId });

		dspActionDb.dspId = dspId ?? dspActionDb.dspId;
		dspActionDb.actionId = actionId ?? dspActionDb.actionId;

		await this.validateForeignKey({
			dspId: dspActionDb.dspId,
			actionId: dspActionDb.actionId,
		});
	}

	private async validateForeignKey({
		dspId,
		actionId,
	}: {
		dspId?: string;
		actionId?: string;
	}): Promise<void> {
		if (dspId) {
			const dsp = await this.dspRepo.findOne({ where: { id: dspId } });
			if (!dsp) {
				throw new ResponseError({
					message: DspActionMessageError.DSP_NOT_FOUND,
					messageCode: DspActionMessageCodeError.DSP_NOT_FOUND,
					messageWarning:
						DspActionMessageError.DSP_NOT_FOUND + ': ' + dspId,
					statusCode: 404,
				});
			}
		}

		if (actionId) {
			const action = await this.actionRepo.findOne({
				where: { id: actionId },
			});
			if (!action) {
				throw new ResponseError({
					message: DspActionMessageError.ACTION_NOT_FOUND,
					messageCode: DspActionMessageCodeError.ACTION_NOT_FOUND,
					messageWarning:
						DspActionMessageError.ACTION_NOT_FOUND +
						': ' +
						actionId,
					statusCode: 404,
				});
			}
		}
	}

	private async validateUnique({
		dspId,
		actionId,
	}: {
		dspId: string;
		actionId: string;
	}) {
		const exist = await this.dspActionRepo.findOne({
			where: { dspId, actionId },
		});

		if (exist) {
			throw new ResponseError({
				message: DspActionMessageError.UNIQUE_CONSTRAINT,
				messageCode: DspActionMessageCodeError.UNIQUE_CONSTRAINT,
				messageWarning:
					DspActionMessageError.UNIQUE_CONSTRAINT +
					`: (dspId: ${dspId} & actionId: ${actionId})`,
				statusCode: 409,
			});
		}
	}

	async getListActionsOfDsp({ dspId }: { dspId: string }) {
		return await this.dspActionRepo
			.createQueryBuilder('dspAction')
			.leftJoin('dspAction.action', 'action')
			.addSelect([
				'action.id',
				'action.name',
				'action.code',
				'action.note',
			])
			.where('dspAction.dspId = :dspId', { dspId })
			.addOrderBy('action.name', 'ASC')
			.getMany();
	}

	private createQueryGetList(query: QueryGetListDspActionDto) {
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

		const qb = this.dspActionRepo
			.createQueryBuilder('dspAction')
			.leftJoin('dspAction.action', 'action')
			.addSelect([
				'action.id',
				'action.name',
				'action.code',
				'action.note',
			]);

		if (keyword) {
			qb.andWhere(
				'action.name ILIKE :keyword OR dspAction.dspId ILIKE :keyword',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				'dspAction.createdAt BETWEEN :startCreatedAt AND :endCreatedAt',
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				'dspAction.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt',
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		qb.orderBy(`dspAction.${fieldOrder}`, orderBy)
			.skip(skip)
			.take(pageSize);

		return qb;
	}

	async getList(query: QueryGetListDspActionDto) {
		const qb = this.createQueryGetList(query);
		return qb.getManyAndCount();
	}
}
