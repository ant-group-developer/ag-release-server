// src/modules/ftp-provider-config/services/ftp-provider-config.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
	connectFtpClient,
	toFtpSecureOption,
} from 'src/common/utils/ftp-client.util';
import { decryptSecret, encryptSecret } from 'src/utils/util.encrypt';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
	CreateFtpProviderConfigDto,
	GetListFtpProviderConfigsDto,
	PartialTestFtpProviderConnectionDto,
	TestFtpProviderConnectionDto,
	UpdateFtpProviderConfigDto,
} from '../dto/ftp-provider-config.dto';
import { FtpProviderConfig } from '../entities/ftp-provider-config.entity';
import { FtpProviderConfigException } from '../const/ftp-provider-config.const';
import { FtpProviderConfigQueryService } from './ftp-provider-config.query.service';

/** Config shape `FtpService` actually needs to open a connection. */
export interface ActiveFtpConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	secure: boolean;
	basePath: string;
}

const ACTIVE_CONFIG_CACHE_TTL_MS = 30_000;

@Injectable()
export class FtpProviderConfigService {
	private readonly logger = new Logger(FtpProviderConfigService.name);

	// In-memory cache so FtpService's per-call getConfig() (loops, discovery
	// scans) doesn't hit Postgres on every list/download. Invalidated
	// immediately on any create/update/delete through this service.
	private activeConfigCache: {
		value: ActiveFtpConfig;
		expiresAt: number;
	} | null = null;

	constructor(
		@InjectRepository(FtpProviderConfig)
		private readonly repo: Repository<FtpProviderConfig>,

		@InjectDataSource()
		private readonly dataSource: DataSource,

		private readonly queryService: FtpProviderConfigQueryService,
	) {}

	/**
	 * Config actually used by FtpService for the live sync/discovery flow.
	 * Cached briefly since a single ETL run can call this many times.
	 */
	async getActiveConfig(): Promise<ActiveFtpConfig> {
		const now = Date.now();
		if (this.activeConfigCache && this.activeConfigCache.expiresAt > now) {
			return this.activeConfigCache.value;
		}

		const entity = await this.repo.findOne({ where: { isActive: true } });
		if (!entity) throw FtpProviderConfigException.NO_ACTIVE_CONFIG();

		const value: ActiveFtpConfig = {
			host: entity.host,
			port: entity.port,
			user: entity.username,
			password: decryptSecret(entity.passwordEncrypted),
			// Preserves FtpService's original behaviour exactly: only 'true' and
			// 'explicit' map to a secure connection. Not using toFtpSecureOption's
			// 'implicit' support here on purpose — that's a new capability scoped
			// to the test-connection endpoint, not the live sync path.
			secure: entity.secure === 'true' || entity.secure === 'explicit',
			basePath: entity.basePath,
		};

		this.activeConfigCache = {
			value,
			expiresAt: now + ACTIVE_CONFIG_CACHE_TTL_MS,
		};
		return value;
	}

	private invalidateCache(): void {
		this.activeConfigCache = null;
	}

	async create(
		data: CreateFtpProviderConfigDto,
		userId?: string,
	): Promise<FtpProviderConfig> {
		const existed = await this.repo.findOne({ where: { code: data.code } });
		if (existed) throw FtpProviderConfigException.CODE_EXISTS();

		const entity = this.repo.create({
			code: data.code,
			name: data.name,
			host: data.host,
			port: data.port ?? 21,
			username: data.username,
			passwordEncrypted: encryptSecret(data.password),
			secure: data.secure ?? 'explicit',
			basePath: data.basePath ?? '/root',
			isActive: false,
			description: data.description ?? null,
			creatorId: userId,
			modifierId: userId,
		});

		const saved = await this.dataSource.transaction(async (manager) => {
			const inserted = await manager.save(FtpProviderConfig, entity);
			if (data.isActive) {
				await this.activateWithinTransaction(manager, inserted.id);
				inserted.isActive = true;
			}
			return inserted;
		});

		this.invalidateCache();
		return saved;
	}

	async update(
		id: string,
		data: UpdateFtpProviderConfigDto,
		userId?: string,
	): Promise<FtpProviderConfig> {
		const existing = await this.repo.findOne({ where: { id } });
		if (!existing) throw FtpProviderConfigException.NOT_FOUND();

		if (data.code && data.code !== existing.code) {
			const codeTaken = await this.repo.findOne({
				where: { code: data.code },
			});
			if (codeTaken) throw FtpProviderConfigException.CODE_EXISTS();
		}

		const updated = await this.dataSource.transaction(async (manager) => {
			const repo = manager.getRepository(FtpProviderConfig);
			repo.merge(existing, {
				code: data.code ?? existing.code,
				name: data.name ?? existing.name,
				host: data.host ?? existing.host,
				port: data.port ?? existing.port,
				username: data.username ?? existing.username,
				passwordEncrypted: data.password
					? encryptSecret(data.password)
					: existing.passwordEncrypted,
				secure: data.secure ?? existing.secure,
				basePath: data.basePath ?? existing.basePath,
				description:
					data.description !== undefined
						? data.description
						: existing.description,
				modifierId: userId,
			});
			const saved = await repo.save(existing);

			if (data.isActive === true) {
				await this.activateWithinTransaction(manager, saved.id);
				saved.isActive = true;
			} else if (data.isActive === false && saved.isActive) {
				saved.isActive = false;
				await repo.update(saved.id, { isActive: false });
			}

			return saved;
		});

		this.invalidateCache();
		return updated;
	}

	/** Unsets is_active on every other row then sets it on `id`, inside the caller's transaction. */
	private async activateWithinTransaction(
		manager: EntityManager,
		id: string,
	): Promise<void> {
		const repo = manager.getRepository(FtpProviderConfig);
		await repo.update({ isActive: true }, { isActive: false });
		await repo.update(id, { isActive: true });
	}

	async findAll(filter: GetListFtpProviderConfigsDto) {
		return this.queryService.getList(filter);
	}

	async findOne(id: string): Promise<FtpProviderConfig> {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw FtpProviderConfigException.NOT_FOUND();
		return entity;
	}

	async remove(id: string): Promise<{ id: string }> {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw FtpProviderConfigException.NOT_FOUND();
		if (entity.isActive) throw FtpProviderConfigException.CANNOT_DELETE_ACTIVE();

		await this.repo.delete({ id });
		this.invalidateCache();
		return { id };
	}

	/** Test connect using the saved config for `id` + any override fields. */
	async testConnectById(
		id: string,
		override: PartialTestFtpProviderConnectionDto,
	): Promise<{ ok: boolean; error?: string }> {
		const entity = await this.findOne(id);

		return this.testConnect({
			host: override.host ?? entity.host,
			port: override.port ?? entity.port,
			username: override.username ?? entity.username,
			password: override.password ?? decryptSecret(entity.passwordEncrypted),
			secure: override.secure ?? entity.secure,
		});
	}

	/** Test connect with a raw config, nothing persisted. */
	async testConnect(
		cfg: TestFtpProviderConnectionDto,
	): Promise<{ ok: boolean; error?: string }> {
		try {
			const client = await connectFtpClient({
				host: cfg.host,
				port: cfg.port ?? 21,
				user: cfg.username,
				password: cfg.password,
				secure: toFtpSecureOption(cfg.secure ?? 'explicit'),
			});
			client.close();
			return { ok: true };
		} catch (error) {
			this.logger.warn(`FTP provider test connection failed: ${error.message}`);
			return { ok: false, error: error.message };
		}
	}
}
