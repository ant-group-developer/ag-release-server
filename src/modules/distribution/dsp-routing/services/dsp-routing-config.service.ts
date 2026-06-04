// src/modules/dsp-routing-configs/services/dsp-routing-config.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { decryptSecretSafe } from 'src/utils/util.encrypt';
import { newTransaction } from 'src/utils/utils.transaction';
import { Repository } from 'typeorm';
import { AggregatorsService } from '../../aggregator/services/aggregators.service';
import { SftpConfigsService } from '../../sftp-configs/services/sftp-config.service';
import {
	PartialTestConnectionDto,
	SftpMetadata,
} from '../../sftp-configs/type/sftp-config.type';
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
	private readonly logger = new Logger(DspRoutingConfigsService.name);
	constructor(
		@InjectRepository(DspRoutingConfig)
		private readonly repo: Repository<DspRoutingConfig>,

		private readonly queryService: DspRoutingConfigQueryService,

		private readonly sftpConfigsService: SftpConfigsService,
		private readonly aggregatorsService: AggregatorsService,
		private readonly appConfigService: AppConfigService,
	) {}

	async createSystemDefault({
		dspId,
		userId,
	}: {
		dspId: string;
		userId: string;
	}) {
		const agg = await this.aggregatorsService.getDefault();
		const config = await this.upsert({
			data: {
				dspId,
				aggregatorId: agg.id,
				mode: RoutingModeEnum.SYSTEM,
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
			relations: {
				aggregator: {
					sftpConfig: true,
				},
				sftpConfig: true,
			},
		});

		if (!entity) {
			const config = await this.createSystemDefault({ dspId, userId });
			return config;
		}

		return entity;
	}

	async handleAggregatorDefaultChanged() {
		try {
			const aggDefault = await this.aggregatorsService.getDefault();
			await this.repo.update(
				{ mode: RoutingModeEnum.SYSTEM },
				{ aggregatorId: aggDefault.id },
			);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async delete({ id, userId }: { id: string; userId: string }) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DspRoutingConfigException.NOT_FOUND();

		await this.repo.update({ id }, { modifierId: userId });
		await this.repo.delete({ id });

		return { id };
	}

	async resolveSftpMetadataByDspCode(code: string): Promise<SftpMetadata> {
		const routing = await this.repo
			.createQueryBuilder('routing')
			.leftJoinAndSelect('routing.dsp', 'dsp')
			.leftJoinAndSelect('routing.sftpConfig', 'sftpConfig')
			.leftJoinAndSelect('routing.aggregator', 'aggregator')
			.leftJoinAndSelect('aggregator.sftpConfig', 'aggregatorSftpConfig')
			.where('dsp.code = :code', { code })
			.andWhere('routing.isActive = true')
			.getOne();

		if (!routing) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		let metadata = null;

		switch (routing.mode) {
			case RoutingModeEnum.DIRECT:
				metadata = routing.sftpConfig?.metadata ?? null;
				break;

			case RoutingModeEnum.AGGREGATOR:
				metadata = routing.aggregator?.sftpConfig?.metadata ?? null;
				break;

			case RoutingModeEnum.SYSTEM:
				metadata = null;
				break;
		}

		if (!metadata) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		this.decryptSecretEntity(metadata);
		return metadata;
	}

	async resolveSftpMetadataByDspId(dspId: string): Promise<SftpMetadata> {
		const routing = await this.repo
			.createQueryBuilder('routing')
			.leftJoinAndSelect('routing.sftpConfig', 'sftpConfig')
			.leftJoinAndSelect('routing.aggregator', 'aggregator')
			.leftJoinAndSelect('aggregator.sftpConfig', 'aggregatorSftpConfig')
			.where('routing.dspId = :dspId', { dspId })
			.andWhere('routing.isActive = true')
			.getOne();

		if (!routing) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		let metadata = null;

		switch (routing.mode) {
			case RoutingModeEnum.DIRECT:
				metadata = routing.sftpConfig?.metadata ?? null;
				break;

			case RoutingModeEnum.AGGREGATOR:
				metadata = routing.aggregator?.sftpConfig?.metadata ?? null;
				break;

			case RoutingModeEnum.SYSTEM:
				metadata = null;
				break;
		}

		if (!metadata) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		this.decryptSecretEntity(metadata);
		return metadata;
	}

	async testConnectByDspId({
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
		const metadata = await this.resolveSftpMetadataByDspId(id);

		const testConfig: SftpMetadata = {
			host: data.host ?? metadata?.host ?? '',
			port: data.port ?? metadata?.port ?? 22,
			username: data.username ?? metadata?.username ?? '',
			password: data.password ?? metadata?.password,
			privateKey: metadata?.privateKey,
			path: metadata?.path,
		};

		return this.sftpConfigsService.testConnect(testConfig);
	}

	private decryptSecretEntity(e: SftpMetadata) {
		if (e.password) {
			e.password = decryptSecretSafe(e.password);
		}

		if (e.privateKey) {
			e.privateKey = decryptSecretSafe(e.privateKey);
		}

		if (e.secretAccessKey) {
			e.secretAccessKey = decryptSecretSafe(e.secretAccessKey);
		}
	}

	/**
	 * Resolve full delivery config for a DSP code.
	 * Returns ernVersion, sender, recipient, sftp — everything needed to process.
	 */
	async resolveFullDeliveryConfig(code: string): Promise<{
		ernVersion: ErnVersion2;
		sender: { partyId: string; name: string };
		recipient: { partyId: string; name: string };
		sftp: SftpMetadata;
		createsDoneFolder: boolean;
		isCI: boolean;
	}> {
		const routing = await this.repo
			.createQueryBuilder('routing')
			.leftJoinAndSelect('routing.dsp', 'dsp')
			.leftJoinAndSelect('routing.sftpConfig', 'sftpConfig')
			.leftJoinAndSelect('routing.aggregator', 'aggregator')
			.leftJoinAndSelect('aggregator.sftpConfig', 'aggregatorSftpConfig')
			.where('dsp.code = :code', { code })
			.andWhere('routing.isActive = true')
			.getOne();

		if (!routing) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		const dsp = routing.dsp;

		// Recipient: always from DSP entity
		if (!dsp?.ddexId || !dsp?.ddexName) {
			throw DspRoutingConfigException.DSP_MISSING_DDEX_PARTY(code);
		}

		const recipient = { partyId: dsp.ddexId, name: dsp.ddexName };

		// Sender + SFTP: depends on routing mode
		let sender: { partyId: string; name: string };
		let sftpMetadata: SftpMetadata | null = null;
		let createsDoneFolder = false;
		let ernVersion: ErnVersion2 = ErnVersion2.ERN_382;
		let isCI = false;

		switch (routing.mode) {
			case RoutingModeEnum.DIRECT: {
				const partyId = this.appConfigService.DDEX_PARTY_ID_AMG();
				const partyName = this.appConfigService.DDEX_PARTY_NAME_AMG();
				if (!partyId || !partyName) {
					throw DspRoutingConfigException.MISSING_APP_CONFIG_DDEX_PARTY();
				}
				sender = { partyId, name: partyName };
				sftpMetadata = routing.sftpConfig?.metadata ?? null;
				ernVersion =
					routing.sftpConfig?.ernVersion ?? ErnVersion2.ERN_382;
				break;
			}

			case RoutingModeEnum.AGGREGATOR: {
				const agg = routing.aggregator;
				if (!agg?.ddexId || !agg?.ddexName) {
					throw DspRoutingConfigException.AGGREGATOR_MISSING_DDEX_PARTY(
						code,
					);
				}
				sender = { partyId: agg.ddexId, name: agg.ddexName };
				sftpMetadata = agg.sftpConfig?.metadata ?? null;
				createsDoneFolder = agg.createsDoneFolder ?? false;
				ernVersion =
					(agg.sftpConfig?.ernVersion as ErnVersion2) ??
					ErnVersion2.ERN_382;
				if (agg.code === 'CI') {
					isCI = true;
				}
				break;
			}

			case RoutingModeEnum.SYSTEM: {
				const partyId = this.appConfigService.DDEX_PARTY_ID_AMG();
				const partyName = this.appConfigService.DDEX_PARTY_NAME_AMG();
				if (!partyId || !partyName) {
					throw DspRoutingConfigException.MISSING_APP_CONFIG_DDEX_PARTY();
				}
				sender = { partyId, name: partyName };
				break;
			}

			default:
				throw DspRoutingConfigException.UNKNOWN_ROUTING_MODE(
					routing.mode,
				);
		}

		if (!sftpMetadata) {
			const aggDefault = await this.aggregatorsService.getDefault();

			if (!aggDefault.sftpConfig?.metadata) {
				throw DspRoutingConfigException.NOT_FOUND();
			}

			return {
				ernVersion,
				sender,
				recipient,
				sftp: aggDefault.sftpConfig?.metadata,
				createsDoneFolder,
				isCI,
			};
		}

		this.decryptSecretEntity(sftpMetadata);

		return {
			ernVersion,
			sender,
			recipient,
			sftp: sftpMetadata,
			createsDoneFolder,
			isCI,
		};
	}

	async resolveRawDeliveryConfig(code: string) {
		const routing = await this.repo
			.createQueryBuilder('routing')
			.leftJoinAndSelect('routing.dsp', 'dsp')
			.leftJoinAndSelect('routing.sftpConfig', 'sftpConfig')
			.leftJoinAndSelect('routing.aggregator', 'aggregator')
			.leftJoinAndSelect('aggregator.sftpConfig', 'aggregatorSftpConfig')
			.where('dsp.code = :code', { code })
			.andWhere('routing.isActive = true')
			.getOne();

		if (!routing) {
			throw DspRoutingConfigException.NOT_FOUND();
		}

		return routing;
	}
}
