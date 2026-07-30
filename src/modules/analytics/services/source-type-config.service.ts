import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
	OnModuleInit,
} from '@nestjs/common';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseMigrationService } from 'src/modules/clickhouse/clickhouse-migration.service';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { randomUUID } from 'crypto';
import { UpsertSourceTypeConfigDto } from '../dto/source-type-config.dto';
import { AnalyticsCacheService } from './analytics-cache.service';

export interface SourceTypeConfig {
	sourceType: string;
	label: string;
	imageUrl: string | null;
	isActive: boolean;
	configVersion: string;
	createdAt: string;
	updatedAt: string;
}

interface SourceTypeConfigRow extends Record<string, unknown> {
	source_type: string;
	label: string;
	image_url: string | null;
	is_active: number;
	config_version: string;
	created_at: string;
	updated_at: string;
}

export interface UploadedSourceTypeImage {
	buffer: Buffer;
	mimetype?: string;
	originalname?: string;
	size?: number;
}

@Injectable()
export class SourceTypeConfigService implements OnModuleInit {
	private readonly logger = new Logger(SourceTypeConfigService.name);
	private readonly activeConfigs = new Map<string, SourceTypeConfig>();
	private initialization: Promise<void> | null = null;

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
		private readonly analyticsCache: AnalyticsCacheService,
		private readonly bucketR2Service: BucketR2Service,
	) {}

	onModuleInit(): void {
		this.ensureInitialized().catch((error) => {
			this.logger.error(
				`Failed to load source type configs: ${error.message}`,
				error.stack,
			);
		});
	}

	resolve(sourceType?: string | null): Pick<
		SourceTypeConfig,
		'sourceType' | 'label' | 'imageUrl'
	> {
		const rawSourceType = sourceType?.trim() || 'ftp';
		const normalized = rawSourceType.toLowerCase();
		const config = this.activeConfigs.get(normalized);
		return config
			? {
					sourceType: config.sourceType,
					label: config.label,
					imageUrl: config.imageUrl,
				}
			: {
					sourceType: rawSourceType,
					label: rawSourceType,
					imageUrl: null,
				};
	}

	async list(): Promise<SourceTypeConfig[]> {
		await this.ensureInitialized();
		const rows = await this.clickHouseService.query<SourceTypeConfigRow>(
			`SELECT source_type, label, image_url, is_active, config_version, created_at, updated_at
			 FROM ${CLICKHOUSE_TABLES.ANALYTICS_SOURCE_TYPE_CONFIGS} FINAL
			 ORDER BY source_type ASC`,
		);
		return rows.map((row) => this.toConfig(row));
	}

	async upsert(
		sourceType: string,
		dto: UpsertSourceTypeConfigDto,
		file?: UploadedSourceTypeImage,
	): Promise<SourceTypeConfig> {
		await this.ensureInitialized();
		const normalized = this.normalizeSourceType(sourceType);
		const existing = await this.findOne(normalized);
		const label = dto.label.trim();
		if (!label) {
			throw new BadRequestException('label must not be blank');
		}
		const now = new Date();
		const configVersion = Math.max(
			now.getTime(),
			Number(existing?.configVersion ?? 0) + 1,
		);
		const timestamp = now.toISOString().replace('T', ' ').replace('Z', '');
		let uploadedImageUrl: string | null = null;
		if (file) {
			uploadedImageUrl = await this.uploadImage(normalized, file);
		}
		const row: SourceTypeConfigRow = {
			source_type: normalized,
			label,
			image_url:
				uploadedImageUrl ??
				(dto.imageUrl === undefined
					? (existing?.imageUrl ?? null)
					: dto.imageUrl),
			is_active: 1,
			config_version: String(configVersion),
			created_at: existing?.createdAt ?? timestamp,
			updated_at: timestamp,
		};

		try {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.ANALYTICS_SOURCE_TYPE_CONFIGS,
				[row],
			);
		} catch (error) {
			if (uploadedImageUrl) await this.deleteManagedImage(uploadedImageUrl);
			throw error;
		}
		const config = this.toConfig(row);
		this.activeConfigs.set(normalized, config);
		this.analyticsCache.clear();
		if (existing?.imageUrl && existing.imageUrl !== config.imageUrl) {
			await this.deleteManagedImage(existing.imageUrl);
		}
		return config;
	}

	async disable(sourceType: string): Promise<SourceTypeConfig> {
		await this.ensureInitialized();
		const normalized = this.normalizeSourceType(sourceType);
		const existing = await this.findOne(normalized);
		if (!existing) {
			throw new NotFoundException(`Source type '${normalized}' was not found`);
		}

		const now = new Date();
		const row: SourceTypeConfigRow = {
			source_type: existing.sourceType,
			label: existing.label,
			image_url: existing.imageUrl,
			is_active: 0,
			config_version: String(
				Math.max(now.getTime(), Number(existing.configVersion) + 1),
			),
			created_at: existing.createdAt,
			updated_at: now.toISOString().replace('T', ' ').replace('Z', ''),
		};

		await this.clickHouseService.insert(
			CLICKHOUSE_TABLES.ANALYTICS_SOURCE_TYPE_CONFIGS,
			[row],
		);
		this.activeConfigs.delete(normalized);
		this.analyticsCache.clear();
		return this.toConfig(row);
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialization) {
			this.initialization = this.initialize();
		}
		return this.initialization;
	}

	private async initialize(): Promise<void> {
		await this.clickHouseMigrationService.waitForMigrations();
		await this.reloadActiveCache();
	}

	private async reloadActiveCache(): Promise<void> {
		const rows = await this.clickHouseService.query<SourceTypeConfigRow>(
			`SELECT source_type, label, image_url, is_active, config_version, created_at, updated_at
			 FROM ${CLICKHOUSE_TABLES.ANALYTICS_SOURCE_TYPE_CONFIGS} FINAL
			 WHERE is_active = 1`,
		);
		this.activeConfigs.clear();
		for (const row of rows) {
			const config = this.toConfig(row);
			this.activeConfigs.set(config.sourceType, config);
		}
		this.logger.log(`Loaded ${this.activeConfigs.size} active source type configs`);
	}

	private async findOne(sourceType: string): Promise<SourceTypeConfig | null> {
		const rows = await this.clickHouseService.query<SourceTypeConfigRow>(
			`SELECT source_type, label, image_url, is_active, config_version, created_at, updated_at
			 FROM ${CLICKHOUSE_TABLES.ANALYTICS_SOURCE_TYPE_CONFIGS} FINAL
			 WHERE source_type = {sourceType:String}
			 LIMIT 1`,
			{ sourceType },
		);
		return rows[0] ? this.toConfig(rows[0]) : null;
	}

	private toConfig(row: SourceTypeConfigRow): SourceTypeConfig {
		return {
			sourceType: row.source_type,
			label: row.label,
			imageUrl: row.image_url || null,
			isActive: Number(row.is_active) === 1,
			configVersion: row.config_version.toString(),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	private normalizeSourceType(sourceType: string): string {
		const normalized = sourceType.trim().toLowerCase();
		if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
			throw new BadRequestException(
				'sourceType must contain only lowercase letters, numbers, underscores, or hyphens',
			);
		}
		return normalized;
	}

	private async uploadImage(
		sourceType: string,
		file: UploadedSourceTypeImage,
	): Promise<string> {
		const extensions: Record<string, string> = {
			'image/jpeg': 'jpg',
			'image/png': 'png',
			'image/webp': 'webp',
			'image/gif': 'gif',
		};
		const contentType = file.mimetype?.toLowerCase() || '';
		const extension = extensions[contentType];
		if (!extension || !file.buffer?.length) {
			throw new BadRequestException(
				'file must be a non-empty JPEG, PNG, WEBP, or GIF image',
			);
		}
		if (file.size && file.size > 5 * 1024 * 1024) {
			throw new BadRequestException('file must not exceed 5 MB');
		}

		const baseUrl = this.getPublicBaseUrl();
		const key = `analytics/source-type-configs/${sourceType}/${randomUUID()}.${extension}`;
		await this.bucketR2Service.uploadBuffer({
			key,
			buffer: file.buffer,
			contentType,
			isPublic: true,
		});

		return `${baseUrl}/${key}`;
	}

	private async deleteManagedImage(imageUrl: string): Promise<void> {
		const baseUrl = (this.bucketR2Service.getBaseUrlPublic() || '').replace(
			/\/+$/,
			'',
		);
		const managedPrefix = `${baseUrl}/analytics/source-type-configs/`;
		if (!baseUrl || !imageUrl.startsWith(managedPrefix)) return;

		const key = imageUrl.slice(`${baseUrl}/`.length);
		try {
			await this.bucketR2Service.deletePublicFile(key);
		} catch (error) {
			this.logger.warn(
				`Could not remove replaced source type image '${key}': ${error.message}`,
			);
		}
	}

	private getPublicBaseUrl(): string {
		const baseUrl = (this.bucketR2Service.getBaseUrlPublic() || '').replace(
			/\/+$/,
			'',
		);
		if (!baseUrl) {
			throw new BadRequestException('R2 public base URL is not configured');
		}
		return baseUrl;
	}
}
