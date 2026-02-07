// src/modules/sftp-configs/services/sftp-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { decryptSecretSafe, encryptSecret } from 'src/utils/util.encrypt';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConnectService } from '../../sftp-connect/sftp-connect.service';
import { SftpConfigException } from '../const/sftp-config.const';
import {
	CreateSftpConfigDto,
	GetListSftpConfigsDto,
} from '../dto/sftp-config.dto';
import { SftpConfig } from '../entities/sftp-config.entity';
import {
	PartialTestConnectionDto,
	SftpMetadata,
} from '../type/sftp-config.type';
import { SftpConfigQueryService } from './sftp-config.query.service';

@Injectable()
export class SftpConfigsService {
	constructor(
		@InjectRepository(SftpConfig)
		private readonly repo: Repository<SftpConfig>,

		private readonly queryService: SftpConfigQueryService,

		private readonly sftpConnectService: SftpConnectService,
	) {}

	async getSftpCi() {
		const e = await this.repo.findOne({
			relations: { aggregator: true },
			where: {
				aggregator: {
					name: 'CI',
				},
			},
		});

		if (!e || !e.metadata) throw SftpConfigException.NOT_FOUND();

		this.decryptSecretEntity(e);

		return e.metadata;
	}

	async upsert({
		data,
		userId,
		manager,
	}: {
		data: CreateSftpConfigDto;
		userId: string;
		manager?: EntityManager;
	}) {
		const repo = this.getDeliverySftpConfigRepo(manager);

		if (data.aggregatorId) {
			const existed = await repo.findOne({
				where: {
					aggregatorId: data.aggregatorId,
					...(data.id ? { id: Not(data.id) } : {}),
				},
			});
			if (existed) throw SftpConfigException.AGGREGATOR_HAS_CONFIG();
		}

		if (data.metadata?.password) {
			data.metadata.password = encryptSecret(data.metadata.password);
		}

		if (data.metadata?.privateKey) {
			data.metadata.privateKey = encryptSecret(data.metadata.privateKey);
		}

		const entity = repo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return repo.save(entity);
	}

	async getList(filter: GetListSftpConfigsDto) {
		const result = await this.queryService.getList(filter);
		this.decryptSecretEntityList(result.items);
		return result;
	}

	async getDetail(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { aggregator: true },
		});
		if (!entity) throw SftpConfigException.NOT_FOUND();

		this.decryptSecretEntity(entity);
		return entity;
	}

	async delete({ id }: { id: string; userId: string }) {
		await this.repo.delete({ id });
	}

	/**
	 * Test connect using config in DB + override fields
	 */
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
		const { metadata } = await this.getDetail(id);

		const testConfig: SftpMetadata = {
			host: data.host ?? metadata?.host ?? '',
			port: data.port ?? metadata?.port ?? 22,
			username: data.username ?? metadata?.username ?? '',
			password: data.password ?? metadata?.password,
			privateKey: metadata?.privateKey,
			path: metadata?.path,
		};

		return this.sftpConnectService.testConnect(testConfig);
	}

	/**
	 * Test connect with raw config (no DB)
	 */
	async testConnect(cfg?: SftpMetadata): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		if (!cfg) {
			return { status: false, latencyMs: 0 };
		}

		return this.sftpConnectService.testConnect(cfg);
	}

	async lsById(id: string, remotePath?: string) {
		const config = await this.getDetail(id);
		return this.ls({ cfg: config.metadata, remotePath });
	}

	async ls({
		cfg,
		remotePath,
	}: {
		cfg?: SftpMetadata;
		remotePath?: string;
	}): Promise<{
		status: boolean;
		path?: string;
		items?: any[];
		error?: any;
	}> {
		if (!cfg) {
			return { status: false, error: 'SFTP_CONFIG_NOT_FOUND' };
		}

		const p = (remotePath?.trim() || cfg.path?.trim() || '/').trim();

		try {
			const items = await this.sftpConnectService.listDirect(cfg, p);
			return { status: true, path: p, items };
		} catch (err: any) {
			return { status: false, error: err?.message || String(err) };
		}
	}

	protected getDeliverySftpConfigRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(SftpConfig) : this.repo;
	}

	// ===== PRIVATE =====

	private decryptSecretEntity(e: SftpConfig) {
		if (e.metadata?.password) {
			e.metadata.password = decryptSecretSafe(e.metadata.password);
		}

		if (e.metadata?.privateKey) {
			e.metadata.privateKey = decryptSecretSafe(e.metadata.privateKey);
		}
	}

	private decryptSecretEntityList(listE: SftpConfig[]) {
		listE.forEach((e) => this.decryptSecretEntity(e));
	}
}
