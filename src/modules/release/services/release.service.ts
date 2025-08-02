import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { ReleaseCoverArtService } from 'src/modules/release-cover-art/services/release-cover-art.service';
import { Repository } from 'typeorm';
import {
	QueryGetListReleaseDto,
	SubmitCreateReleaseDto,
	UpdateReleaseDto,
} from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import {
	IRelease,
	IReleaseDetail,
	IReleaseNonDraft,
} from '../interfaces/release.interface';
import { ReleaseQueryService } from './release.query.service';
import { ReleaseValidateService } from './release.validate.service';

@Injectable()
export class ReleaseService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		private readonly releaseValidateService: ReleaseValidateService,
		private readonly releaseQueryService: ReleaseQueryService,
		// private readonly bucketService: BucketService,

		private readonly releaseCoverArtService: ReleaseCoverArtService,
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
		await this.releaseQueryService.findOne(id);

		// validate nonDraft
		const releaseNonDraft =
			this.releaseValidateService.ensureNonDraftRelease({
				...data,
				status: ReleaseStatus.PROCESSING,
			});

		await this.releaseRepo.save(releaseNonDraft);
		const result = await this.releaseQueryService.findOne(id);

		// convert to IReleaseNonDraft
		return this.releaseValidateService.ensureNonDraftRelease(result);
	}

	async getOneDetail(id: string): Promise<IReleaseDetail> {
		const release = await this.releaseQueryService.getOneDetail(id);

		const { releaseCoverArts, ...restOfRelease } = release;

		const coverArtThumbnails =
			this.releaseCoverArtService.getCoverArtThumbnails(releaseCoverArts);

		return {
			...restOfRelease,
			coverArtThumbnails,
		};
	}

	async getListDetail(
		query: QueryGetListReleaseDto,
	): Promise<PageDto<IReleaseDetail>> {
		const { page, pageSize } = query;

		const [releasesRaw, totalItems] =
			await this.releaseQueryService.getListDetail(query);

		return new PageDto({
			items: await this.getReleasesDetails(releasesRaw),
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateReleaseDto): Promise<IRelease> {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } = data;

		const release = await this.releaseQueryService.findOne(id);

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
		return await this.releaseQueryService.findOne(id);
	}

	private async getReleasesDetails(releases: Release[]) {
		return await Promise.all(
			releases.map(async (release) => {
				const { releaseCoverArts, ...restOfRelease } = release;

				const [coverArtThumbnails, totalDuration] = await Promise.all([
					this.releaseCoverArtService.getCoverArtThumbnails(
						releaseCoverArts,
					),
					this.releaseQueryService.getTotalDurationOfRelease(
						release.id,
					),
				]);

				return {
					...restOfRelease,
					totalDuration,
					coverArtThumbnails,
				};
			}),
		);
	}
}
