import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
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
	IReleaseNonDraft,
	IReleaseWithCoverArt,
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
		private readonly bucketService: BucketService,
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

	async getDetail(id: string): Promise<IReleaseWithCoverArt> {
		const release = await this.releaseQbService.getDetail(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails =
			await this.getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async getList(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<IReleaseWithCoverArt>> {
		const { page, pageSize } = query;

		const [releases, totalItems] =
			await this.releaseQbService.getList(query);

		return new PageDto({
			items: await this.getReleasesWithCoverArt(releases),
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

	private async getCoverArtThumbnails(
		coverArts: ReleaseCoverArt[],
	): Promise<ICoverArtThumbnails> {
		const result: ICoverArtThumbnails = {
			'75x75': null,
			'100x100': null,
			'160x160': null,
			'300x300': null,
			'900x900': null,
			original: null,
		};

		for (const coverArt of coverArts) {
			if (
				[
					'75x75',
					'100x100',
					'160x160',
					'300x300',
					'900x900',
					'original',
				].includes(coverArt.type)
			) {
				result[coverArt.type as keyof ICoverArtThumbnails] =
					await this.bucketService.getUrlRead(coverArt.fileId);
			}
		}

		return result;
	}

	private async getReleasesWithCoverArt(
		releases: Release[],
	): Promise<IReleaseWithCoverArt[]> {
		const result: IReleaseWithCoverArt[] = [];

		for (const release of releases) {
			const { releaseCoverArts, ...restOfRelease } = release;

			const coverArtThumbnails =
				await this.getCoverArtThumbnails(releaseCoverArts);

			result.push({
				...restOfRelease,
				coverArtThumbnails,
			});
		}

		return result;
	}
}
