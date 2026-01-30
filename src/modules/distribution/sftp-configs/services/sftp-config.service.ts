// src/modules/sftp-configs/services/sftp-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { decryptSecretSafe, encryptSecret } from 'src/utils/util.encrypt';
import SftpClient from 'ssh2-sftp-client';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConfigException } from '../const/sftp-config.const';
import {
	CreateSftpConfigDto,
	GetListSftpConfigsDto,
} from '../dto/sftp-config.dto';
import { SftpConfig } from '../entities/sftp-config.entity';
import { SftpMetadata } from '../type/sftp-config.type';
import { SftpConfigQueryService } from './sftp-config.query.service';

@Injectable()
export class SftpConfigsService {
	constructor(
		@InjectRepository(SftpConfig)
		private readonly repo: Repository<SftpConfig>,

		private readonly queryService: SftpConfigQueryService,
	) {}

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

		if (data.metadata?.password)
			data.metadata.password = encryptSecret(data.metadata?.password);

		if (data.metadata?.privateKey)
			data.metadata.privateKey = encryptSecret(data.metadata?.privateKey);

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

	async delete({ id, userId }: { id: string; userId: string }) {
		await this.repo.delete({ id });
	}

	async testConnectById(id: string): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		const config = await this.getDetail(id);
		return await this.testConnect(config?.metadata);
	}

	async testConnect(cfg?: SftpMetadata): Promise<{
		status: boolean;
		latencyMs?: number;
		error?: any;
	}> {
		if (!cfg) {
			return {
				status: true,
				latencyMs: 0,
			};
		}

		const sftp = new SftpClient();
		const start = Date.now();

		try {
			await sftp.connect({
				host: cfg.host,
				port: cfg.port ?? 22,
				username: cfg.username,
				password: cfg.password,
				readyTimeout: 10 * 1000,
			});

			const latencyMs = Date.now() - start;

			return {
				status: true,
				latencyMs,
			};
		} catch (err) {
			return {
				status: false,
				error: err?.message || String(err),
			};
		} finally {
			await sftp.end();
		}
	}

	protected getDeliverySftpConfigRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(SftpConfig) : this.repo;
	}

	// private
	private decryptSecretEntity(e: SftpConfig) {
		if (e.metadata?.password)
			e.metadata.password = decryptSecretSafe(e.metadata.password);

		if (e.metadata?.privateKey)
			e.metadata.privateKey = decryptSecretSafe(e.metadata.privateKey);
	}

	private decryptSecretEntityList(listE: SftpConfig[]) {
		listE.map((e) => this.decryptSecretEntity(e));
	}
}
