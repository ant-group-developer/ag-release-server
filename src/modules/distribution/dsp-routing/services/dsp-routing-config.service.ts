// src/modules/dsp-routing-configs/services/dsp-routing-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Repository } from 'typeorm';
import { AggregatorsService } from '../../aggregator/services/aggregators.service';
import { SftpConfigsService } from '../../sftp-configs/services/sftp-config.service';
import { DspRoutingConfigException } from '../const/dsp-routing-config.const';
import {
	CreateDspRoutingConfigDto,
	GetListDspRoutingConfigsDto,
} from '../dto/dsp-routing-config.dto';
import { DspRoutingConfig } from '../entities/dsp-routing-config.entity';
import { RoutingModeEnum } from '../enum/dsp-routing.enum';
import { DspRoutingConfigQueryService } from './dsp-routing-config.query.service';

@Injectable()
export class DspRoutingConfigsService {
	constructor(
		@InjectRepository(DspRoutingConfig)
		private readonly repo: Repository<DspRoutingConfig>,

		private readonly queryService: DspRoutingConfigQueryService,

		private readonly sftpConfigsService: SftpConfigsService,
		private readonly aggregatorsService: AggregatorsService,
	) {}

	async createDefault({ dspId, userId }: { dspId: string; userId: string }) {
		const agg = await this.aggregatorsService.getDefault();
		const config = await this.upsert({
			data: {
				dspId,
				aggregatorId: agg.id,
				mode: RoutingModeEnum.AGGREGATOR,
			},
			userId,
		});

		return config;
	}

	async upsert({
		data,
		userId,
	}: {
		data: CreateDspRoutingConfigDto;
		userId: string;
	}) {
		const { sftpConfig, ...rest } = data;

		const queryRunner = await newTransaction(this.repo);

		try {
			const { manager } = queryRunner;

			const routingRepo = manager.getRepository(DspRoutingConfig);

			// 1) validate theo mode
			this.queryService.validateCreateRoutingConfig({
				mode: rest.mode,
				aggregatorId: rest.aggregatorId,
			});

			const existed = await routingRepo.findOne({
				where: { dspId: rest.dspId },
			});

			let routingDb: DspRoutingConfig;

			if (!existed) {
				const entity = routingRepo.create({
					...rest,
					isActive: rest.isActive ?? true,
					creatorId: userId,
					modifierId: userId,
				});

				routingDb = await routingRepo.save(entity);
			} else {
				// update: không set creatorId
				Object.assign(existed, {
					...rest,
					isActive: rest.isActive ?? existed.isActive,
					modifierId: userId,
				});

				routingDb = await routingRepo.save(existed);
			}

			// 3) nếu có sftpConfig -> tạo mới và gán vào routing
			if (sftpConfig) {
				const createdSftp = await this.sftpConfigsService.upsert({
					userId,
					data: {
						...sftpConfig,
						aggregatorId: null,
					},
					manager,
				});

				// update dspRouting
				routingDb.sftpConfigId = createdSftp.id;
				routingDb.modifierId = userId;

				await routingRepo.save(routingDb);
			}

			await this.aggregatorsService.syncDspUsageCountOnRoutingChange({
				oldAggregatorId: existed?.aggregatorId ?? null,
				newAggregatorId: routingDb.aggregatorId ?? null,
				manager,
			});

			await queryRunner.commitTransaction();

			return this.getDetail(routingDb.id);
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}

	async getList(filter: GetListDspRoutingConfigsDto) {
		return this.queryService.getList(filter);
	}

	async getDetail(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { aggregator: true, sftpConfig: true },
		});
		if (!entity) throw DspRoutingConfigException.NOT_FOUND();
		return entity;
	}

	async getDetailByDspIdOrCreate({
		dspId,
		userId,
	}: {
		dspId: string;
		userId: string;
	}) {
		const entity = await this.repo.findOne({
			where: { dspId },
			relations: { aggregator: true, sftpConfig: true },
		});

		if (!entity) {
			const config = await this.createDefault({ dspId, userId });
			return config;
		}

		return entity;
	}

	// async update({
	// 	id,
	// 	data,
	// 	userId,
	// }: {
	// 	id: string;
	// 	data: UpdateDspRoutingConfigDto;
	// 	userId: string;
	// }) {
	// 	const entity = await this.repo.findOne({ where: { id } });
	// 	if (!entity) throw DspRoutingConfigException.NOT_FOUND();

	// 	await this.repo.update(
	// 		{ id },
	// 		{
	// 			...data,
	// 			modifierId: userId,
	// 		},
	// 	);

	// 	return this.getDetail(id);
	// }

	handleAggregatorDefaultChange() {}

	async delete({ id, userId }: { id: string; userId: string }) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DspRoutingConfigException.NOT_FOUND();

		await this.repo.update({ id }, { modifierId: userId });
		await this.repo.delete({ id });

		return { id };
	}
}
