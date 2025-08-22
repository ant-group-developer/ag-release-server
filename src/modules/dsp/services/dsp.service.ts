import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import difference from 'lodash/difference';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { DspAction } from 'src/modules/dsp-action/entities/dsp-action.entities';
import { DspActionService } from 'src/modules/dsp-action/services/dsp-action.service';
import { In, Repository } from 'typeorm';
import { DspMessageError } from '../constants/dsp.constant';
import { DspMessages } from '../constants/dsp.message';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';
import { DspQueryService } from './dsp.query.service';

@Injectable()
export class DspService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly bucketService: BucketService,
		private readonly dspQueryService: DspQueryService,

		private readonly dspActionService: DspActionService,
	) {}

	// create
	async handleCreate(data: CreateDspDto) {
		const { dspActions, ...rest } = data;

		const dsp = await this.createDsp(rest);
		const { messageWarning } = await this.createDspActionsSafe({
			dspId: dsp.id,
			dspActions,
		});

		return new ResponseSuccess({
			data: await this.findOne(dsp.id),
			messageWarning,
		});
	}

	private async createDsp(data: Omit<CreateDspDto, 'dspActions'>) {
		await this.dspQueryService.validate({ name: data.name });
		const dsp = this.dspRepo.create(data);
		return await this.dspRepo.save(dsp);
	}

	private async createDspActionsSafe({
		dspId,
		dspActions,
	}: {
		dspId: string;
		dspActions: CreateDspDto['dspActions'];
	}) {
		if (dspActions && dspActions.length > 0) {
			const inputBulkCreateDspActions = dspActions.map((item) => {
				return {
					...item,
					dspId,
				};
			});

			const dataCreateDspActions =
				await this.dspActionService.bulkCreateSafe(
					inputBulkCreateDspActions,
				);

			return {
				dspActions: dataCreateDspActions
					.map((item) => item.entity)
					.filter((entity): entity is DspAction => entity !== null),
				messageWarning: dataCreateDspActions
					.map((item) => item.messageWarning)
					.join('\n'),
			};
		} else {
			return {
				dspActions: [],
				messageWarning: undefined,
			};
		}
	}

	// read
	async findOne(id: string): Promise<Dsp> {
		return this.dspQueryService.findOne(id);
	}

	async getListActionsOfDsp(id: string) {
		return await this.dspActionService.getListActionsOfDsp({ dspId: id });
	}

	private async findOneWithCountRelation(id: string): Promise<Dsp> {
		const dsp = await this.dspQueryService.findOneWithCountRelation(id);
		if (!dsp) {
			throw new ResponseError({ message: DspMessageError.NOT_FOUND });
		}

		return dsp;
	}

	async getList(query: QueryGetListDspDto): Promise<PageDto<Dsp>> {
		const { page, pageSize } = query;

		const [dsps, totalItems] = await this.dspQueryService.getList(query);

		return new PageDto({
			items: dsps,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListWithActions(query: QueryGetListDspDto): Promise<PageDto<Dsp>> {
		const { page, pageSize } = query;

		const [dsps, totalItems] =
			await this.dspQueryService.getListWithActions(query);

		return new PageDto({
			items: dsps.filter((item) => item.dspActions.length > 0),
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async handleUpdate({ dspId, data }: { dspId: string; data: UpdateDspDto }) {
		const { dspActions, ...rest } = data;

		await this.updateDsp({ dspId, data: rest });
		const messageWarning = await this.updateDspActions({
			dspId,
			dspActions,
		});

		const result = await this.findOne(dspId);
		return new ResponseSuccess({
			data: result,
			messageWarning,
		});
	}

	private async updateDsp({
		dspId,
		data,
	}: {
		dspId: string;
		data: Omit<UpdateDspDto, 'dspActions'>;
	}): Promise<Dsp> {
		const { name, picture } = data;
		const dsp = await this.findOne(dspId);

		if (name && name !== dsp.name) {
			await this.dspQueryService.validate({ name });
		}

		if (picture !== undefined && picture !== dsp.picture && dsp.picture) {
			await this.bucketService.deletePublicFile(dsp.picture);
		}

		await this.dspRepo.update(dspId, data);
		return await this.findOne(dspId);
	}

	private async updateDspActions({
		dspId,
		dspActions,
	}: {
		dspId: string;
		dspActions: UpdateDspDto['dspActions'];
	}) {
		if (!dspActions?.length) return;

		const dataCreate = [];
		const dataUpdate = [];
		const messageWarnings = [];

		for (const item of dspActions) {
			if (!item.id) {
				dataCreate.push({ ...item, dspId });
			} else {
				dataUpdate.push({ id: item.id, ...item, dspId });
			}
		}

		if (dataCreate.length) {
			const dataCreateDspActions =
				await this.dspActionService.bulkCreateSafe(dataCreate);
			const messageWarning = dataCreateDspActions
				.map((item) => item.messageWarning)
				.join('\n');
			messageWarnings.push(messageWarning);
		}

		if (dataUpdate.length) {
			const messageWarning =
				await this.dspActionService.bulkUpdateSafe(dataUpdate);

			messageWarnings.push(messageWarning);
		}

		return messageWarnings.join('\n');
	}

	// delete
	async handleDelete(id: string): Promise<void> {
		const dsp = await this.findOneWithCountRelation(id);
		this.dspQueryService.validateDelete(dsp);

		//
		await Promise.all(
			dsp.dspActions.map((item) => this.deleteDspAction(item.id)),
		);

		await this.deleteDsp(dsp);
	}

	private async deleteDsp(dsp: Dsp): Promise<void> {
		if (dsp.picture) {
			await this.bucketService.deletePublicFileSafe(dsp.picture);
		}
		await this.dspRepo.delete(dsp.id);
	}

	async deleteDspAction(dspActionId: string) {
		await this.dspActionService.delete(dspActionId);
	}

	async validateExisted(roleIds: string[]) {
		const listDsp = await this.dspRepo.find({
			where: {
				id: In(roleIds),
			},
			select: ['id'],
		});
		const data = listDsp.map((item) => item.id);

		if (data.length !== roleIds.length) {
			const between = difference(roleIds, data);
			throw new ResponseError({
				...DspMessages.NOT_FOUND,
				data: between,
			});
		}
	}
}
