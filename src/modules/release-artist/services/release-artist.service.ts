import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { Repository } from 'typeorm';
import { ReleaseArtistMessage } from '../constants/release-artist.constant';
import {
	BulkCreateReleaseArtistDto,
	CreateReleaseArtistDto,
	QueryGetListReleaseArtistDto,
	UpdateReleaseArtistDto,
} from '../dto/release-artist.dto';
import { ReleaseArtist } from '../entities/release-artist.entity';
import { ReleaseArtistValidateService } from './release-artist.validate.service';

@Injectable()
export class ReleaseArtistService {
	private readonly logger = new Logger(ReleaseArtistService.name);

	constructor(
		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		private readonly releaseArtistValidateService: ReleaseArtistValidateService,
		private readonly trackDraftService: TrackDraftService,
	) {}

	// create
	async create(data: CreateReleaseArtistDto): Promise<ReleaseArtist> {
		const releaseArtist = this.releaseArtistRepo.create(data);

		await this.releaseArtistValidateService.handleValidateCreate({
			releaseArtist,
		});

		const releaseArtistDb =
			await this.releaseArtistRepo.save(releaseArtist);

		await this.handleCreateSubEntities({
			releaseArtist: releaseArtistDb,
			createDto: data,
		});

		return releaseArtistDb;
	}

	async createSafe(
		data: CreateReleaseArtistDto,
	): Promise<ReleaseArtist | null> {
		try {
			return await this.create(data);
		} catch (error: any) {
			this.logger.warn(
				`Skip create release artist, reason: ${error.message}`,
			);
			return null;
		}
	}

	async bulkCreate(
		data: BulkCreateReleaseArtistDto,
	): Promise<ReleaseArtist[]> {
		const results = await Promise.all(
			data.items.map((item) => this.createSafe(item)),
		);
		return results.filter(
			(item): item is ReleaseArtist => item !== null,
		);
	}

	// read
	async findOne(id: string): Promise<ReleaseArtist> {
		const releaseArtist = await this.releaseArtistRepo.findOne({
			where: { id },
		});

		if (!releaseArtist) {
			throw new ResponseError(ReleaseArtistMessage.NOT_FOUND);
		}

		return releaseArtist;
	}

	async getList(
		query: QueryGetListReleaseArtistDto,
	): Promise<PageDto<ReleaseArtist>> {
		const { page, pageSize, skip } = query;

		const [releaseArtists, totalItems] =
			await this.releaseArtistRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: releaseArtists,
			metadata: {
				page,
				pageSize,
				totalItems,
			},
		});
	}

	// update
	async update(
		id: string,
		dataUpdate: UpdateReleaseArtistDto,
	): Promise<ReleaseArtist> {
		const releaseArtistPrevious = await this.findOne(id);

		const releaseArtistUpdate = Object.assign(
			{},
			releaseArtistPrevious,
			dataUpdate,
		);

		await this.releaseArtistValidateService.handleValidateUpdate({
			releaseArtistPrevious,
			releaseArtistUpdate,
		});

		await this.releaseArtistRepo.save(releaseArtistUpdate);

		const releaseArtistDb = await this.findOne(id);

		await this.updateRelatedRecords(releaseArtistDb);
		await this.handleIsAddArtistToTrack({
			addArtistToTracksPrevious: releaseArtistPrevious.addArtistToTracks,
			releaseArtist: releaseArtistDb,
			addArtistToTracks: dataUpdate.addArtistToTracks,
		});

		return releaseArtistDb;
	}

	// delete
	async delete(id: string) {
		await this.releaseArtistRepo.delete(id);
	}

	async deleteSafe(id: string) {
		await this.releaseArtistRepo
			.delete(id)
			.catch((e) =>
				this.logger.warn(`Skip delete, reason: ${e.message}`),
			);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const releaseArtists = await this.releaseArtistRepo.find({
			where: { releaseId },
		});

		await Promise.all(
			releaseArtists.map((item) => this.handleDelete(item.id)),
		);
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteRelatedRecords(id);
		await this.deleteSafe(id);
	}

	async deleteRelatedRecords(releaseArtistId: string) {
		await this.trackDraftService.deleteTrackArtistByReleaseArtist(
			releaseArtistId,
		);
	}

	// private
	private async handleCreateSubEntities({
		releaseArtist,
		createDto,
	}: {
		releaseArtist: ReleaseArtist;
		createDto: CreateReleaseArtistDto;
	}) {
		// kéo artist sang những track đang bật lấy artist từ release
		await this.syncTrackContributorsFromReleaseArtist(releaseArtist);

		// đẩy artist sang track nếu user chọn add artist to track
		if (createDto.addArtistToTracks) {
			await this.trackDraftService.addArtistToTracks(releaseArtist);
		}
	}

	private async syncTrackContributorsFromReleaseArtist(
		releaseArtist: ReleaseArtist,
	) {
		await this.trackDraftService.syncTrackContributorsFromReleaseArtist(
			releaseArtist,
		);
	}

	private async updateRelatedRecords(releaseArtist: ReleaseArtist) {
		await this.trackDraftService.updateTrackArtist(releaseArtist);
	}

	private async handleIsAddArtistToTrack({
		addArtistToTracks,
		addArtistToTracksPrevious,
		releaseArtist,
	}: {
		addArtistToTracks?: boolean;
		addArtistToTracksPrevious: boolean;
		releaseArtist: ReleaseArtist;
	}) {
		if (addArtistToTracks !== undefined) {
			if (
				addArtistToTracks === true &&
				addArtistToTracks !== addArtistToTracksPrevious
			) {
				await this.trackDraftService.addArtistToTracks(releaseArtist);
			}

			if (
				addArtistToTracks === false &&
				addArtistToTracks !== addArtistToTracksPrevious
			) {
				await this.trackDraftService.deleteTrackArtists(releaseArtist);
			}
		}
	}
}
