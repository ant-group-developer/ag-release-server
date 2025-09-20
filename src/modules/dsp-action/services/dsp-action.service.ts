import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { DspMessage } from 'src/modules/dsp/constants/dsp.constant';
import { Repository } from 'typeorm';
import { DspAction } from '../entities/dsp-action.entities';
import {
	ICreateDspAction,
	IUpdateDspAction,
	QueryGetListDspActionDto,
} from '../interface/dsp-action.interface';
import { DspActionQueryService } from './dsp-action.query.service';

@Injectable()
export class DspActionService {
	private readonly logger = new Logger(DspActionService.name);

	constructor(
		@InjectRepository(DspAction)
		private readonly dspActionRepo: Repository<DspAction>,

		private readonly dspActionQueryService: DspActionQueryService,
	) {}

	private async create(data: ICreateDspAction): Promise<DspAction> {
		const { dspId } = data;

		await this.dspActionQueryService.validateCreate(data);
		const dspAction = this.dspActionRepo.create(data);
		if (data.isDefault === true) {
			await this.resetDefaultForDsp({ dspId });
		}
		return await this.dspActionRepo.save(dspAction);
	}

	async createSafe(data: ICreateDspAction) {
		try {
			const entity = await this.create(data);

			return { entity, messageWarning: null };
		} catch (error) {
			const messageWarning =
				error?.response?.messageWarning ?? 'Unknown error';
			this.logger.error(messageWarning);
			return { entity: null, messageWarning };
		}
	}

	async bulkCreateSafe(data: ICreateDspAction[]) {
		return await Promise.all(data.map((item) => this.createSafe(item)));
	}

	// read
	private async findOne(id: string) {
		const dspAction = await this.dspActionRepo.findOne({ where: { id } });

		if (!dspAction)
			throw new ResponseError({
				...DspMessage.NOT_FOUND,
				messageWarning: DspMessage.NOT_FOUND.message + `: ${id}`,
			});

		return dspAction;
	}

	async getList(
		query: QueryGetListDspActionDto,
	): Promise<PageDto<DspAction>> {
		const { page, pageSize } = query;
		const [items, totalItems] =
			await this.dspActionQueryService.getList(query);

		return new PageDto({
			items,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListActionsOfDsp({ dspId }: { dspId: string }) {
		return await this.dspActionQueryService.getListActionsOfDsp({ dspId });
	}

	async bulkUpdateSafe(data: IUpdateDspAction[]) {
		return await Promise.all(
			data.map((item) => this.updateSafe(item.id, item)),
		);
	}

	private async updateSafe(
		id: string,
		data: IUpdateDspAction,
	): Promise<string> {
		return await this.update(id, data).catch((error) => {
			const messageWarning = error?.response?.messageWarning;
			this.logger.error(messageWarning);
			return messageWarning ?? 'Unknown error';
		});
	}

	private async update(id: string, data: IUpdateDspAction) {
		const dspActionDb = await this.findOne(id);

		await this.dspActionQueryService.validateUpdate({
			dspActionDb,
			dataUpdate: data,
		});

		if (data?.isDefault) {
			await this.resetDefaultForDsp({ dspId: dspActionDb.dspId });
		}

		await this.dspActionRepo.update(id, data);
	}

	async delete(id: string): Promise<void> {
		await this.findOne(id);
		await this.dspActionRepo.delete(id);
	}

	//
	private async resetDefaultForDsp({ dspId }: { dspId: string }) {
		await this.dspActionRepo.update({ dspId }, { isDefault: false });
	}
}
