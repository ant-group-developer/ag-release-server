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

		const { releases, totalItems } =
			await this.releaseQueryService.getManyAndCount(query);

		const enhancedRelease = this.enhanceReleasesDetails(releases);

		return new PageDto({
			items: enhancedRelease,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	private enhanceReleasesDetails(releases: Release[]) {
		return releases.map((release) => {
			const { releaseCoverArts, ...restOfRelease } = release;

			const coverArtThumbnails =
				this.releaseCoverArtService.getCoverArtThumbnails(
					releaseCoverArts,
				);

			return {
				...restOfRelease,
				coverArtThumbnails,
			};
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
}
