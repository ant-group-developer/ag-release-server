import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { Repository } from 'typeorm';
import { ReleaseArtistMessageError } from '../constants/release-artist.constant';
import {
	CreateReleaseArtistDto,
	QueryGetListReleaseArtistDto,
	UpdateReleaseArtistDto,
} from '../dto/release-artist.dto';
import { ReleaseArtist } from '../entities/release-artist.entity';
import { ReleaseArtistValidateService } from './release-artist.validate.service';

@Injectable()
export class ReleaseArtistService {
	constructor(
		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		private readonly releaseArtistValidateService: ReleaseArtistValidateService,

		private readonly trackDraftService: TrackDraftService,
	) {}

	// create
	async create(
		createReleaseArtistDto: CreateReleaseArtistDto,
	): Promise<ReleaseArtist> {
		const { artistId, artistRoleId, releaseId } = createReleaseArtistDto;

		await this.releaseArtistValidateService.validate({
			artistId,
			artistRoleId,
			releaseId,
		});

		const releaseArtist = this.releaseArtistRepo.create(
			createReleaseArtistDto,
		);
		const releaseArtistDb =
			await this.releaseArtistRepo.save(releaseArtist);
		await this.pasteReleaseArtistToTrackArtist(releaseArtistDb);

		return releaseArtistDb;
	}

	// read
	async findOne(id: string): Promise<ReleaseArtist> {
		const releaseArtist = await this.releaseArtistRepo.findOne({
			where: { id },
		});

		if (!releaseArtist) {
			throw new ResponseError({
				message: ReleaseArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
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
				currentPage: page,
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
		const releaseArtist = await this.findOne(id);

		await this.releaseArtistValidateService.handleValidateUpdate({
			releaseArtist,
			dataUpdate,
		});

		await this.releaseArtistRepo.update(id, dataUpdate);
		const releaseArtistDb = await this.findOne(id);

		await this.updateRelatedRecords(releaseArtistDb);
		await this.handleArtistToTrack2({
			releaseArtist: releaseArtistDb,
			addArtistToTracks: dataUpdate.addArtistToTracks,
		});

		return releaseArtistDb;
	}

	//delete
	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		const releaseArtists = await this.releaseArtistRepo.find({
			where: { releaseId },
		});

		for (const item of releaseArtists) {
			await this.delete(item.id);
		}
	}

	async delete(id: string): Promise<void> {
		await this.deleteRelatedRecords(id);
		await this.releaseArtistRepo.delete(id);
	}

	async deleteRelatedRecords(releaseArtistId: string) {
		await this.trackDraftService.deleteByReleaseArtist(releaseArtistId);
	}

	// artist
	private async pasteReleaseArtistToTrackArtist(
		releaseArtist: ReleaseArtist,
	) {
		await this.trackDraftService.addArtistToTracks(releaseArtist);
	}

	private async updateRelatedRecords(releaseArtist: ReleaseArtist) {
		await this.trackDraftService.updateByReleaseArtist(releaseArtist);
	}

	private async handleArtistToTrack2({
		addArtistToTracks,
		releaseArtist,
	}: {
		addArtistToTracks?: boolean;
		releaseArtist: ReleaseArtist;
	}) {
		if (addArtistToTracks !== undefined) {
			if (addArtistToTracks === true) {
				await this.trackDraftService.addArtistToTracks2(releaseArtist);
			}
			if (addArtistToTracks === false) {
				await this.trackDraftService.deleteArtistTracks2(releaseArtist);
			}
		}
	}
}
