// src/modules/distribution/dsp-routing/services/dsp-routing.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { newTransaction } from 'src/utils/utils.transaction';
import { EntityManager, In, Not, Repository } from 'typeorm';
import { DeliveryConfig } from '../../delivery-config/entities/delivery-config.entity';
import { DspRoutingException } from '../const/dsp-routing.const';
import {
	AutoCreateDspRoutingSettingDto,
	GetListDspRoutingSettingsDto,
	UpdateDspRoutingSettingDto,
	UpsertDspRoutingSettingDto,
} from '../dto/dsp-routing.dto';
import { DspRoutingSetting } from '../entities/dsp-routing-setting.entity';
// import { RoutingModeEnum } from '../enum/dsp-routing.enum';
import { DeliveryConfigService } from '../../delivery-config/services/delivery-config.service';
import { DspRoutingQueryService } from './dsp-routing.query.service';

@Injectable()
export class DspRoutingService {
	constructor(
		@InjectRepository(DspRoutingSetting)
		private readonly repo: Repository<DspRoutingSetting>,
		private readonly queryService: DspRoutingQueryService,

		private readonly deliveryConfigService: DeliveryConfigService,
	) {}

	// distribution

	// phân phối release -> vào bảng dsp_release_status lấy list các bảng
	// chia ra 2 loại, ci, spotify
	//

	// ci
	// import: tạo batch id trên ci, parse release, đẩy sang thư mục ci
	// export: list dsp, tạo file export
	// crud
	async upsert(data: UpsertDspRoutingSettingDto) {
		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const routingRepo = manager.getRepository(DspRoutingSetting);

			const { directConfig, specificAggregatorConfig, ...rest } = data;

			let directConfigId: string | null = null;
			let specificAggregatorConfigId: string | null = null;
			if (directConfig) {
				const directConfigDb = await this.deliveryConfigService.upsert({
					data: directConfig,
					manager,
				});
				directConfigId = directConfigDb.id;
			}

			if (specificAggregatorConfig) {
				const specificAggregatorConfigDb =
					await this.deliveryConfigService.upsert({
						data: specificAggregatorConfig,
						manager,
					});

				specificAggregatorConfigId = specificAggregatorConfigDb.id;
			}

			await routingRepo.upsert(
				{ ...rest, directConfigId, specificAggregatorConfigId },
				['dspId'],
			);

			await transaction.commitTransaction();

			return this.findOneByDspId(rest.dspId);
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async createAuto(data: AutoCreateDspRoutingSettingDto) {
		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const routingRepo = manager.getRepository(DspRoutingSetting);
			const deliveryRepo = manager.getRepository(DeliveryConfig);
			const dspRepo = manager.getRepository(Dsp);

			// resolve mode + validate config
			// const resolved = await this.resolveAndValidateConfigSelection(
			// 	deliveryRepo,
			// 	{
			// 		directConfigId: data.directConfigId ?? null,
			// 		specificAggregatorConfigId:
			// 			data.specificAggregatorConfigId ?? null,
			// 	},
			// );

			// lấy tất cả dsp active
			const dsps: Array<{ id: string }> = await dspRepo.find({
				select: ['id'],
				where: { isActive: true },
			});

			if (!dsps.length) {
				await transaction.commitTransaction();
				return { created: 0, skipped: 0, totalDsp: 0 };
			}

			const dspIds = dsps.map((d) => d.id);

			// lấy các routing setting đã tồn tại (1 DSP = 1 routing setting)
			const existed = await routingRepo.find({
				select: ['dspId'],
				where: { dspId: In(dspIds) },
			});
			const existedSet = new Set<string>(
				existed.map((x: any) => x.dspId),
			);

			const toInsert = dspIds
				.filter((dspId) => !existedSet.has(dspId))
				.map((dspId) =>
					routingRepo.create({
						dspId,
						// mode: resolved.mode,
						// directConfigId: resolved.directConfigId,
						// specificAggregatorConfigId:
						// resolved.specificAggregatorConfigId,
					}),
				);

			if (toInsert.length) {
				await routingRepo.save(toInsert);
			}

			await transaction.commitTransaction();

			return {
				created: toInsert.length,
				skipped: existedSet.size,
				totalDsp: dspIds.length,
			};
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async update({
		id,
		data,
	}: {
		id: string;
		data: UpdateDspRoutingSettingDto;
	}) {
		const existed = await this.findOne(id);
		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRoutingRepo = manager.getRepository(DspRoutingSetting);
			const txDeliveryRepo = manager.getRepository(DeliveryConfig);

			// partial update: undefined = keep old, null = clear
			// const nextDirectConfigId =
			// 	data.directConfigId !== undefined
			// 		? (data.directConfigId ?? null)
			// 		: existed.directConfigId;

			// const nextSpecificAggConfigId =
			// 	data.specificAggregatorConfigId !== undefined
			// 		? (data.specificAggregatorConfigId ?? null)
			// 		: existed.specificAggregatorConfigId;

			// infer mode from ids (direct wins if provided)
			// const resolved = await this.resolveAndValidateConfigSelection(
			// 	txDeliveryRepo,
			// 	{
			// 		directConfigId: nextDirectConfigId,
			// 		specificAggregatorConfigId: nextSpecificAggConfigId,
			// 	},
			// );

			await txRoutingRepo.update(id, {
				// mode: resolved.mode,
				// directConfigId: resolved.directConfigId,
				// specificAggregatorConfigId: resolved.specificAggregatorConfigId,
			});

			await transaction.commitTransaction();

			return this.repo.findOne({
				where: { id },
				relations: {
					// directConfig: true,
					// specificAggregatorConfig: true,
				},
			});
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async delete(id: string) {
		const entity = await this.findOne(id);
		await this.repo.remove(entity);
		return { id: entity.id };
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			// relations: { directConfig: true, specificAggregatorConfig: true },
		});
		if (!entity) throw DspRoutingException.NOT_FOUND();
		return entity;
	}

	async findOneByDspId(dspId: string) {
		const entity = await this.repo.findOne({
			where: { dspId },
			// relations: { directConfig: true, specificAggregatorConfig: true },
		});
		if (!entity) throw DspRoutingException.NOT_FOUND();
		return entity;
	}

	async getList(filter: GetListDspRoutingSettingsDto) {
		return this.queryService.getList(filter);
	}

	// private
	// private async resolveAndValidateConfigSelection(
	// 	deliveryRepo: Repository<DeliveryConfig>,
	// 	input: {
	// 		directConfigId: string | null;
	// 		specificAggregatorConfigId: string | null;
	// 	},
	// ) {
	// 	const hasDirect = !!input.directConfigId;
	// 	const hasAgg = !!input.specificAggregatorConfigId;

	// 	// không cho gửi cả 2
	// 	if (hasDirect && hasAgg)
	// 		throw DspRoutingException.INVALID_MODE_CONFIG();

	// 	// DIRECT nếu có directConfigId
	// 	if (hasDirect) {
	// 		const direct = await this.ensureDeliveryConfigExists(
	// 			deliveryRepo,
	// 			input.directConfigId!,
	// 		);

	// 		return {
	// 			// mode: RoutingModeEnum.DIRECT,
	// 			directConfigId: direct.id,
	// 			specificAggregatorConfigId: null,
	// 		};
	// 	}

	// 	// AGGREGATOR default, nếu có specificAggregatorConfigId thì validate
	// 	let specificId: string | null = null;
	// 	if (hasAgg) {
	// 		const agg = await this.ensureDeliveryConfigExists(
	// 			deliveryRepo,
	// 			input.specificAggregatorConfigId!,
	// 		);
	// 		specificId = agg.id;
	// 	}

	// 	return {
	// 		// mode: RoutingModeEnum.AGGREGATOR,
	// 		directConfigId: null,
	// 		specificAggregatorConfigId: specificId,
	// 	};
	// }

	private async ensureDeliveryConfigExists(
		deliveryRepo: Repository<DeliveryConfig>,
		id: string,
	): Promise<DeliveryConfig> {
		const cfg = await deliveryRepo.findOne({ where: { id } });
		if (!cfg) throw DspRoutingException.DELIVERY_CONFIG_NOT_FOUND();
		return cfg;
	}

	private async validateUnique({
		dspId,
		excludeId,
	}: {
		dspId?: string;
		excludeId?: string;
	}) {
		if (dspId) {
			const existed = await this.repo.findOne({
				where: {
					dspId,
					...(excludeId ? { id: Not(excludeId) } : {}),
				},
				select: ['id'],
			});

			if (existed) throw DspRoutingException.ALREADY_EXISTS();
		}
	}

	protected getDspRoutingRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(DspRoutingSetting) : this.repo;
	}
}
