import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { BucketService2 } from 'src/modules/bucket2/services/bucket2.service';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import {
	BulkUpsertReleaseCaptionsDto,
	CreateReleaseCaptionDto,
	UpdateReleaseCaptionDto,
} from './dto/release-caption.dto';
import {
	ReleaseCaption,
	ReleaseCaptionType,
} from './entities/release-caption.entity';

@Injectable()
export class ReleaseCaptionService {
	constructor(
		@InjectRepository(ReleaseCaption)
		private readonly captionRepo: Repository<ReleaseCaption>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,

		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		private readonly bucketService: BucketService2,
	) {}

	async create(releaseId: string, dto: CreateReleaseCaptionDto) {
		return this.upsertOne(releaseId, dto);
	}

	async bulkUpsert(dto: BulkUpsertReleaseCaptionsDto) {
		await this.ensureRelease(dto.releaseId);

		const result: ReleaseCaption[] = [];
		for (const caption of dto.captions) {
			result.push(await this.upsertOne(dto.releaseId, caption));
		}

		return result;
	}

	async getList(releaseId: string, type?: ReleaseCaptionType) {
		return this.captionRepo.find({
			where: { releaseId, ...(type ? { type } : {}) },
			relations: { file: true, language: true },
			order: { language: { code: 'ASC' } },
		});
	}

	async findOne(id: string) {
		const caption = await this.captionRepo.findOne({
			where: { id },
			relations: { file: true, language: true, release: true },
		});

		if (!caption) {
			throw new NotFoundException('Release caption not found');
		}

		return caption;
	}

	async update(id: string, dto: UpdateReleaseCaptionDto) {
		const caption = await this.captionRepo.findOne({ where: { id } });
		if (!caption) {
			throw new NotFoundException('Release caption not found');
		}

		if (dto.fileId && dto.fileId !== caption.fileId) {
			await this.ensureFile(dto.fileId);
			await this.bucketService.deleteSafe(caption.fileId);
		}

		if (dto.languageId && dto.languageId !== caption.languageId) {
			await this.ensureLanguage(dto.languageId);
		}

		Object.assign(caption, {
			...dto,
			languageId: dto.languageId ?? caption.languageId,
			type: dto.type ?? caption.type,
		});

		const updated = await this.captionRepo.save(caption);
		return this.findOne(updated.id);
	}

	async remove(id: string) {
		const caption = await this.findOne(id);
		await this.captionRepo.delete(id);
		await this.bucketService.deleteSafe(caption.fileId);

		return { success: true };
	}

	async deleteByReleaseId(releaseId: string) {
		const captions = await this.captionRepo.find({ where: { releaseId } });
		await this.captionRepo.delete({ releaseId });
		await Promise.all(
			captions.map((caption) =>
				this.bucketService.deleteSafe(caption.fileId),
			),
		);

		return { success: true };
	}

	private async upsertOne(releaseId: string, dto: CreateReleaseCaptionDto) {
		await this.ensureRelease(releaseId);
		await this.ensureFile(dto.fileId);
		await this.ensureLanguage(dto.languageId);
		const type = dto.type ?? ReleaseCaptionType.CAPTION;

		const existing = await this.captionRepo.findOne({
			where: { releaseId, languageId: dto.languageId, type },
		});

		if (existing) {
			if (existing.fileId !== dto.fileId) {
				await this.bucketService.deleteSafe(existing.fileId);
			}

			Object.assign(existing, {
				fileId: dto.fileId,
				type,
			});

			return this.captionRepo.save(existing);
		}

		const caption = this.captionRepo.create({
			releaseId,
			languageId: dto.languageId,
			type,
			fileId: dto.fileId,
		});

		return this.captionRepo.save(caption);
	}

	private async ensureRelease(releaseId: string) {
		const exists = await this.releaseRepo.exist({
			where: { id: releaseId },
		});
		if (!exists) throw new NotFoundException('Release not found');
	}

	private async ensureFile(fileId: string) {
		const exists = await this.fileRepo.exist({
			where: { id: fileId },
		});
		if (!exists) throw new NotFoundException('Caption file not found');
	}

	private async ensureLanguage(languageId: string) {
		const exists = await this.languageRepo.exist({
			where: { id: languageId },
		});
		if (!exists) throw new NotFoundException('Language not found');
	}
}
