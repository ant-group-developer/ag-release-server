import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';

import {
	ActionMessageCodeError,
	ActionMessageError,
} from '../constants/action.constant';
import { QueryGetListActionDto } from '../dtos/action.dto';
import { Action } from '../entities/action.entity';

@Injectable()
export class ActionQueryService {
	constructor(
		@InjectRepository(Action)
		private readonly actionRepo: Repository<Action>,
	) {}

	private createQueryGetList(query: QueryGetListActionDto) {
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

		const queryBuilder = this.actionRepo.createQueryBuilder('action');

		if (keyword) {
			queryBuilder.andWhere('action.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`action.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`action.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		queryBuilder.orderBy(`action.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListActionDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	// validate
	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const existingName = await this.actionRepo.findOne({
				where: { name },
			});
			if (existingName) {
				throw new ResponseError({
					message: ActionMessageError.DUPLICATE_NAME_ACTION,
					messageCode: ActionMessageCodeError.DUPLICATE_NAME_ACTION,
					statusCode: 409,
				});
			}
		}

		if (code) {
			const existingCode = await this.actionRepo.findOne({
				where: { code },
			});
			if (existingCode) {
				throw new ResponseError({
					message: ActionMessageError.DUPLICATE_CODE_ACTION,
					messageCode: ActionMessageCodeError.DUPLICATE_CODE_ACTION,
					statusCode: 409,
				});
			}
		}
	}

	async findOneWithCountRelation(id: string) {
		const query = this.actionRepo.createQueryBuilder('action');

		// virtual count dsp_actions
		query.addSelect((subQuery) => {
			return subQuery
				.select('COUNT(dsp_action.id)')
				.from('dsp_action', 'dsp_action')
				.where('dsp_action.action_id = action.id');
		}, 'dsp_action_count');

		query.where('action.id = :id', { id });

		const dataFromDb: {
			raw: {
				action_id: string;
				dsp_action_count: string;
			}[];
			entities: Action[];
		} = await query.getRawAndEntities();

		const actions = this.assigneeVirtualColumn(dataFromDb);
		return actions[0];
	}

	private assigneeVirtualColumn(dataFromDb: {
		raw: { action_id: string; dsp_action_count: string }[];
		entities: Action[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.find(
				(item) => item.action_id === entity.id,
			);

			entity.dspActionCount = Number(dataRaw?.dsp_action_count);
			return entity;
		});
	}

	validateDelete(action: Action) {
		if ((action.dspActionCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					ActionMessageError.CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS,
				messageCode:
					ActionMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS,
				messageWarning: `${ActionMessageError.CANNOT_DELETE_BECAUSE_LINKED_DSP_ACTIONS}: ${action.id}`,
				statusCode: 400,
			});
		}
	}
}
