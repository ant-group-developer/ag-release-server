import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeApiKey } from '../entities/youtube-api-key.entity';
import { YoutubeApiKeyStatus } from '../enum/youtube.enum';
import { CreateYoutubeApiKeyDto } from '../dto/create-api-key.dto';
import { UpdateYoutubeApiKeyDto } from '../dto/update-api-key.dto';
import { YoutubeEncryptionService } from './youtube-encryption.service';

export interface YoutubeApiKeyPublicView {
	id: string;
	alias: string;
	keyHint: string;
	status: YoutubeApiKeyStatus;
	dailyQuotaLimit: number;
	unitsConsumedToday: number;
	unitsRemaining: number;
	lastResetAt: Date;
	lastUsedAt: Date | null;
	lastError: string | null;
	consecutiveErrorCount: number;
	createdAt: Date;
	updatedAt: Date;
}

@Injectable()
export class YoutubeApiKeyService {
	private readonly logger = new Logger(YoutubeApiKeyService.name);

	constructor(
		@InjectRepository(YoutubeApiKey)
		private readonly repo: Repository<YoutubeApiKey>,
		private readonly encryptionService: YoutubeEncryptionService,
	) {}

	async create(dto: CreateYoutubeApiKeyDto): Promise<YoutubeApiKeyPublicView> {
		const existing = await this.repo.findOne({ where: { alias: dto.alias } });
		if (existing) {
			throw new ConflictException(`Alias '${dto.alias}' da ton tai`);
		}

		const encrypted = this.encryptionService.encrypt(dto.apiKey);
		const hint = this.encryptionService.buildHint(dto.apiKey);

		const key = this.repo.create({
			alias: dto.alias,
			keyEncrypted: encrypted,
			keyHint: hint,
			status: YoutubeApiKeyStatus.ACTIVE,
			dailyQuotaLimit: dto.dailyQuotaLimit ?? 10000,
			unitsConsumedToday: 0,
			consecutiveErrorCount: 0,
		});

		const saved = await this.repo.save(key);
		this.logger.log(`Created YouTube API key alias=${saved.alias} id=${saved.id}`);
		return this.toPublicView(saved);
	}

	async findAll(): Promise<YoutubeApiKeyPublicView[]> {
		const keys = await this.repo.find({ order: { createdAt: 'DESC' } });
		return keys.map((k) => this.toPublicView(k));
	}

	async findOne(id: string): Promise<YoutubeApiKeyPublicView> {
		const key = await this.repo.findOne({ where: { id } });
		if (!key) throw new NotFoundException(`YouTube API key ${id} not found`);
		return this.toPublicView(key);
	}

	async update(
		id: string,
		dto: UpdateYoutubeApiKeyDto,
	): Promise<YoutubeApiKeyPublicView> {
		const key = await this.repo.findOne({ where: { id } });
		if (!key) throw new NotFoundException(`YouTube API key ${id} not found`);

		if (dto.alias !== undefined && dto.alias !== key.alias) {
			const dup = await this.repo.findOne({ where: { alias: dto.alias } });
			if (dup) throw new ConflictException(`Alias '${dto.alias}' da ton tai`);
			key.alias = dto.alias;
		}
		if (dto.status !== undefined) {
			if (
				dto.status !== YoutubeApiKeyStatus.ACTIVE &&
				dto.status !== YoutubeApiKeyStatus.DISABLED
			) {
				throw new BadRequestException(
					'Chi cho phep set status=active hoac disabled qua API',
				);
			}
			key.status = dto.status;
		}
		if (dto.dailyQuotaLimit !== undefined) {
			key.dailyQuotaLimit = dto.dailyQuotaLimit;
		}

		const saved = await this.repo.save(key);
		return this.toPublicView(saved);
	}

	async remove(id: string): Promise<void> {
		const result = await this.repo.delete({ id });
		if (!result.affected) {
			throw new NotFoundException(`YouTube API key ${id} not found`);
		}
	}

	async resetQuota(id: string): Promise<YoutubeApiKeyPublicView> {
		const key = await this.repo.findOne({ where: { id } });
		if (!key) throw new NotFoundException(`YouTube API key ${id} not found`);
		key.unitsConsumedToday = 0;
		key.lastResetAt = new Date();
		if (key.status === YoutubeApiKeyStatus.QUOTA_EXCEEDED) {
			key.status = YoutubeApiKeyStatus.ACTIVE;
		}
		const saved = await this.repo.save(key);
		return this.toPublicView(saved);
	}

	/**
	 * Danh cho pool service: load tat ca keys ACTIVE hoac QUOTA_EXCEEDED de refresh in-memory.
	 * Khong return plaintext, pool tu decrypt khi can.
	 */
	async findUsableKeysRaw(): Promise<YoutubeApiKey[]> {
		return this.repo.find({
			where: [
				{ status: YoutubeApiKeyStatus.ACTIVE },
				{ status: YoutubeApiKeyStatus.QUOTA_EXCEEDED },
			],
		});
	}

	async findByIdRaw(id: string): Promise<YoutubeApiKey | null> {
		return this.repo.findOne({ where: { id } });
	}

	/**
	 * Decrypt key plaintext. Chi goi tu pool khi acquire.
	 */
	decryptKey(key: YoutubeApiKey): string {
		return this.encryptionService.decrypt(key.keyEncrypted);
	}

	/**
	 * Persist quota update tu pool (fire-and-forget).
	 */
	async persistUsage(
		id: string,
		fields: Partial<
			Pick<
				YoutubeApiKey,
				| 'unitsConsumedToday'
				| 'lastUsedAt'
				| 'status'
				| 'lastError'
				| 'consecutiveErrorCount'
			>
		>,
	): Promise<void> {
		await this.repo.update({ id }, fields);
	}

	async resetAllQuotaCounters(): Promise<{ affected: number }> {
		const result = await this.repo
			.createQueryBuilder()
			.update(YoutubeApiKey)
			.set({
				unitsConsumedToday: 0,
				lastResetAt: () => 'now()',
				status: () =>
					`CASE WHEN status = '${YoutubeApiKeyStatus.QUOTA_EXCEEDED}' THEN '${YoutubeApiKeyStatus.ACTIVE}' ELSE status END`,
			})
			.where('status IN (:...statuses)', {
				statuses: [YoutubeApiKeyStatus.ACTIVE, YoutubeApiKeyStatus.QUOTA_EXCEEDED],
			})
			.execute();
		return { affected: result.affected ?? 0 };
	}

	private toPublicView(k: YoutubeApiKey): YoutubeApiKeyPublicView {
		return {
			id: k.id,
			alias: k.alias,
			keyHint: k.keyHint,
			status: k.status,
			dailyQuotaLimit: k.dailyQuotaLimit,
			unitsConsumedToday: k.unitsConsumedToday,
			unitsRemaining: Math.max(0, k.dailyQuotaLimit - k.unitsConsumedToday),
			lastResetAt: k.lastResetAt,
			lastUsedAt: k.lastUsedAt,
			lastError: k.lastError,
			consecutiveErrorCount: k.consecutiveErrorCount,
			createdAt: k.createdAt,
			updatedAt: k.updatedAt,
		};
	}
}
