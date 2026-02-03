import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';

import { ActionMessage } from '../constants/action.constant';
import {
	CreateActionDto,
	QueryGetListActionDto,
	UpdateActionDto,
} from '../dtos/action.dto';
import { Action } from '../entities/action.entity';
import { ActionQueryService } from './action.query.service';

@Injectable()
export class ActionService {
	constructor(
		@InjectRepository(Action)
		private readonly actionRepo: Repository<Action>,
		private readonly actionQueryService: ActionQueryService,
	) {}

	async create(data: CreateActionDto, userId: string): Promise<Action> {
		const { name, code } = data;

		await this.actionQueryService.validate({ name, code });
		const action = this.actionRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.actionRepo.save(action);
	}

	async findOne(id: string): Promise<Action> {
		const action = await this.actionRepo.findOne({ where: { id } });
		if (!action) {
			throw new ResponseError(ActionMessage.NOT_FOUND);
		}
		return action;
	}

	async findOneWithCountRelation(id: string) {
		const action =
			await this.actionQueryService.findOneWithCountRelation(id);

		if (!action) {
			throw new ResponseError(ActionMessage.NOT_FOUND);
		}

		return action;
	}

	async getList(query: QueryGetListActionDto): Promise<PageDto<Action>> {
		const { page, pageSize } = query;
		const [actions, totalItems] =
			await this.actionQueryService.getList(query);

		return new PageDto({
			items: actions,
			metadata: { page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.actionRepo.find({
			select: ['id', 'code', 'name', 'note'],
		});
	}

	async update(
		id: string,
		data: UpdateActionDto,
		userId: string,
	): Promise<Action> {
		const { name, code } = data;
		const action = await this.findOne(id);

		if (name && name !== action.name) {
			await this.actionQueryService.validate({ name });
		}
		if (code && code !== action.code) {
			await this.actionQueryService.validate({ code });
		}

		await this.actionRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const action = await this.findOneWithCountRelation(id);
		this.actionQueryService.validateDelete(action);
		await this.actionRepo.delete(id);
	}
}
