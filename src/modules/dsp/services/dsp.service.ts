import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import difference from 'lodash/difference';
import {
	PageDto,
	ResponseError,
	ResponseSuccess,
} from 'src/common/dtos/common.response.dto';
import { AppEvent } from 'src/common/enums/common';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { PartialTestConnectionDto } from 'src/modules/distribution/sftp-configs/type/sftp-config.type';
import { DspAction } from 'src/modules/dsp-action/entities/dsp-action.entities';
import { DspActionService } from 'src/modules/dsp-action/services/dsp-action.service';
import { stringToCode } from 'src/utils/util';
import { ILike, In, Repository } from 'typeorm';
import { DspMessages } from '../constants/dsp.message';
import { CreateDspDto, QueryGetListDspDto, UpdateDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';
import { DspQueryService } from './dsp.query.service';

@Injectable()
export class DspService {
	private readonly logger = new Logger(DspService.name);
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		private readonly bucketService: BucketService2,
		private readonly dspQueryService: DspQueryService,

		private readonly dspActionService: DspActionService,
		private readonly eventEmitter: EventEmitter2,
		private readonly dspRoutingConfigsService: DspRoutingConfigsService,
		// private readonly sftpConnectService: SftpConnectService,
	) {}

	private emitEventDdexParty() {
		this.logger.log(`Event: ${AppEvent.UPDATE_DDEX_PARTY}}`);
		this.eventEmitter.emit(AppEvent.UPDATE_DDEX_PARTY);
	}

	// create
	async handleCreate(data: CreateDspDto, userId: string) {
		const { dspActions, ...rest } = data;

		const dsp = await this.createDsp(rest, userId);
		const { messageWarning } = await this.createDspActionsSafe({
			dspId: dsp.id,
			dspActions,
		});

		return new ResponseSuccess({
			data: await this.findOne(dsp.id),
			messageWarning,
		});
	}

	private async createDsp(
		data: Omit<CreateDspDto, 'dspActions'>,
		userId: string,
	) {
		await this.dspQueryService.validate({ name: data.name });
		const code = stringToCode(data.name);
		const dsp = this.dspRepo.create({
			...data,
			code,
			modifierId: userId,
			creatorId: userId,
		});
		this.emitEventDdexParty();
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

	async testConnectById({
		id,
		data,
	}: {
		id: string;
		data: PartialTestConnectionDto;
	}): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		return await this.dspRoutingConfigsService.testConnectByDspId({
			id,
			data,
		});
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
			throw new ResponseError(DspMessages.NOT_FOUND);
		}

		return dsp;
	}

	async getList(query: QueryGetListDspDto): Promise<PageDto<Dsp>> {
		const { page, pageSize } = query;

		const [dsps, totalItems] = await this.dspQueryService.getList(query);

		return new PageDto({
			items: dsps,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple(query: QueryGetListDspDto) {
		const { keyword } = query;

		const items = await this.dspRepo.find({
			select: {
				id: true,
				name: true,
				picture: true,
			},
			where: {
				...(keyword ? { name: ILike(`%${keyword}%`) } : {}),
			},
			order: { name: 'ASC' },
			// cache: {
			// 	id: 'list_dsp_simple',
			// 	milliseconds: 1000 * 60 * 60,
			// },
		});

		return items;
	}

	async getListDspEnablePolicy() {
		return this.dspQueryService.getListDspEnablePolicy();
	}

	// update
	async handleUpdate({
		dspId,
		data,
		userId,
	}: {
		dspId: string;
		data: UpdateDspDto;
		userId: string;
	}) {
		const { dspActions, ...rest } = data;

		const dsp = await this.findOne(dspId);

		await this.updateDsp({ dsp, data: rest, userId });
		const messageWarning = await this.updateDspActions({
			dsp,
			dspActions,
		});

		const result = await this.findOne(dspId);
		return new ResponseSuccess({
			data: result,
			messageWarning,
		});
	}

	private async updateDsp({
		dsp,
		data,
		userId,
	}: {
		dsp: Dsp;
		data: Omit<UpdateDspDto, 'dspActions'>;
		userId: string;
	}): Promise<Dsp> {
		const { name, picture } = data;

		if (name && name !== dsp.name) {
			await this.dspQueryService.validate({ name });
		}

		if (picture !== undefined && picture !== dsp.picture && dsp.picture) {
			await this.bucketService.deletePublicFile(dsp.picture);
		}

		this.emitEventDdexParty();

		await this.dspRepo.update(dsp.id, { ...data, modifierId: userId });
		return await this.findOne(dsp.id);
	}

	private async updateDspActions({
		dsp,
		dspActions,
	}: {
		dsp: Dsp;
		dspActions: UpdateDspDto['dspActions'];
	}) {
		if (!dspActions) return;

		const { id: dspId, dspActions: dspActionsDb } = dsp;

		const dataCreate = [];
		const dataUpdate = [];

		for (const item of dspActions) {
			if (!item.id) {
				dataCreate.push({ ...item, dspId });
			} else {
				dataUpdate.push({ id: item.id, ...item, dspId });
			}
		}

		const listUpdateIds = dataUpdate.map((item) => item.id);
		const listDbIds = dspActionsDb.map((item) => item.id);

		const listDeleteIds = listDbIds.filter(
			(id) => !listUpdateIds.includes(id),
		);

		const [created, updated] = await Promise.all([
			this.dspActionService.bulkCreateSafe(dataCreate),
			this.dspActionService.bulkUpdateSafe(dataUpdate),
			...listDeleteIds.map((id) => this.deleteDspAction(id)),
		]);

		// build warnings
		const messageWarnings: string[] = [];
		if (created) {
			messageWarnings.push(
				created.map((item) => item.messageWarning).join('\n'),
			);
		}
		if (updated) {
			messageWarnings.push(
				Array.isArray(updated) ? updated.join('\n') : updated,
			);
		}

		return messageWarnings.filter(Boolean).join('\n');
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

	async getDdexPartySpotify() {
		const dsp = await this.dspRepo.findOne({
			where: {
				code: 'SPOTIFY',
			},
		});

		if (!dsp) {
			return { ddexId: '', ddexName: '' };
		}

		return { ddexId: dsp.ddexId ?? '', ddexName: dsp.ddexName ?? '' };
	}
}
