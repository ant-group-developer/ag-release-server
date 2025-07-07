import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { ReleaseCoverArt } from 'src/modules/release-cover-art/entities/release-cover-art.entity';
import { Repository } from 'typeorm';
import {
	QueryGetListReleaseDto,
	SubmitCreateReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import {
	ICoverArtThumbnails,
	IRelease,
	IReleaseDetail,
	IReleaseNonDraft,
} from '../interfaces/release.interface';
import { ReleaseQbService } from './release.qb.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQbService: ReleaseQbService,
	) {}

	// async create(data: CreateReleaseDto): Promise<Release> {
	// 	const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

	// 	await this.releaseValidateService.validate({
	// 		labelId,
	// 		primaryGenreId,
	// 		subGenreId,
	// 		releaseTimezoneId,
	// 	});

	// 	const release = this.releaseRepo.create(data);
	// 	return await this.releaseRepo.save(release);
	// }

	async submit(
		id: string,
		data: SubmitCreateReleaseDto,
	): Promise<IReleaseNonDraft> {
		// validate id
		await this.releaseQbService.findOne(id);

		// validate nonDraft
		const releaseNonDraft =
			this.releaseValidateService.ensureNonDraftRelease({
				...data,
				status: ReleaseStatus.PROCESSING,
			});

		await this.releaseRepo.save(releaseNonDraft);
		const result = await this.releaseQbService.findOne(id);

		// convert to IReleaseNonDraft
		return this.releaseValidateService.ensureNonDraftRelease(result);
	}

	async getDetail(id: string): Promise<IReleaseDetail> {
		const release = await this.releaseQbService.getDetail(id);

		const { releaseCoverArt, ...restOfRelease } = release;

		const coverArtThumbnails = this.getCoverArtThumbnails(releaseCoverArt);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async getList(query: QueryGetListReleaseDto): Promise<PageDto<IRelease>> {
		const { page, pageSize } = query;

		const [releases, totalItems] =
			await this.releaseQbService.getList(query);

		return new PageDto({
			items: releases,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateReleaseDto): Promise<IRelease> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		const release = await this.releaseQbService.findOne(id);

		if (release.status === ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Error release.status',
			});
		}

		if (labelId && labelId !== release.labelId) {
			await this.releaseValidateService.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.releaseValidateService.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.releaseValidateService.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.releaseValidateService.validate({
				releaseTimezoneId,
			});
		}

		await this.releaseRepo.update(id, data);
		return await this.releaseQbService.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.releaseRepo.delete(id);
	}

	private getCoverArtThumbnails(
		data: ReleaseCoverArt[],
	): ICoverArtThumbnails {
		const result: ICoverArtThumbnails = {
			'75x75': null,
			'100x100': null,
			'160x160': null,
			'300x300': null,
			'900x900': null,
			original: null,
		};

		data.forEach((item) => {
			if (
				[
					'75x75',
					'100x100',
					'160x160',
					'300x300',
					'900x900',
					'original',
				].includes(item.type)
			) {
				result[item.type as keyof ICoverArtThumbnails] = item.fileId;
			}
		});

		return result;
	}
}
