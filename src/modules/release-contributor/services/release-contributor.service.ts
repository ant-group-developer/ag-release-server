import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { TrackDraftService } from 'src/modules/track/services/track.draft.service';
import { Repository } from 'typeorm';

import { ReleaseContributorException } from '../constants/release-contributor.exception';
import {
	CreateReleaseContributorDto,
	QueryGetListReleaseContributorDto,
	UpdateReleaseContributorDto,
} from '../dto/release-contributor.dto';
import { ReleaseContributor } from '../entities/release-contributor.entity';
import { ReleaseContributorValidateService } from './release-contributor.validate.service';

@Injectable()
export class ReleaseContributorService {
	private readonly logger = new Logger(ReleaseContributorService.name);

	constructor(
		@InjectRepository(ReleaseContributor)
		private readonly releaseContributorRepo: Repository<ReleaseContributor>,

		private readonly releaseContributorValidateService: ReleaseContributorValidateService,
		private readonly trackDraftService: TrackDraftService,
	) {}

	async create(
		data: CreateReleaseContributorDto,
	): Promise<ReleaseContributor> {
		const releaseContributor = this.releaseContributorRepo.create(data);

		await this.releaseContributorValidateService.handleValidateCreate({
			releaseContributor,
		});

		const releaseContributorDb =
			await this.releaseContributorRepo.save(releaseContributor);

		await this.handleCreateSubEntities({
			releaseContributor: releaseContributorDb,
			createDto: data,
		});

		return releaseContributorDb;
	}

	async findOne(id: string): Promise<ReleaseContributor> {
		const releaseContributor = await this.releaseContributorRepo.findOne({
			where: { id },
		});

		if (!releaseContributor) {
			throw ReleaseContributorException.NOT_FOUND();
		}

		return releaseContributor;
	}

	async getList(
		query: QueryGetListReleaseContributorDto,
	): Promise<PageDto<ReleaseContributor>> {
		const { page, pageSize, skip } = query;

		const [items, totalItems] =
			await this.releaseContributorRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		dataUpdate: UpdateReleaseContributorDto,
	): Promise<ReleaseContributor> {
		const previous = await this.findOne(id);

		const updated = Object.assign({}, previous, dataUpdate);

		await this.releaseContributorValidateService.handleValidateUpdate({
			releaseContributorPrevious: previous,
			releaseContributorUpdate: updated,
		});

		await this.releaseContributorRepo.save(updated);

		const dbRecord = await this.findOne(id);

		await this.updateRelatedRecords(dbRecord);
		await this.handleIsAddContributorToTrack({
			addContributorToTracksPrevious: previous.addContributorToTracks,
			releaseContributor: dbRecord,
			addContributorToTracks: dataUpdate.addContributorToTracks,
		});

		return dbRecord;
	}

	async delete(id: string) {
		await this.releaseContributorRepo.delete(id);
	}

	async deleteSafe(id: string) {
		await this.releaseContributorRepo
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
		const items = await this.releaseContributorRepo.find({
			where: { releaseId },
		});

		await Promise.all(items.map((item) => this.handleDelete(item.id)));
	}

	async handleDelete(id: string): Promise<void> {
		await this.deleteRelatedRecords(id);
		await this.deleteSafe(id);
	}

	async deleteRelatedRecords(releaseContributorId: string) {
		await this.trackDraftService.deleteTrackContributorByReleaseContributor(
			releaseContributorId,
		);
	}

	private async handleCreateSubEntities({
		releaseContributor,
		createDto,
	}: {
		releaseContributor: ReleaseContributor;
		createDto: CreateReleaseContributorDto;
	}) {
		await this.syncTrackContributorsFromReleaseContributor(
			releaseContributor,
		);

		if (createDto.addContributorToTracks) {
			await this.trackDraftService.addContributorToTracks(
				releaseContributor,
			);
		}
	}

	private async syncTrackContributorsFromReleaseContributor(
		releaseContributor: ReleaseContributor,
	) {
		await this.trackDraftService.syncTrackContributorsFromReleaseContributor(
			releaseContributor,
		);
	}

	private async updateRelatedRecords(releaseContributor: ReleaseContributor) {
		await this.trackDraftService.updateTrackContributor(releaseContributor);
	}

	private async handleIsAddContributorToTrack({
		addContributorToTracks,
		addContributorToTracksPrevious,
		releaseContributor,
	}: {
		addContributorToTracks?: boolean;
		addContributorToTracksPrevious: boolean;
		releaseContributor: ReleaseContributor;
	}) {
		if (addContributorToTracks !== undefined) {
			if (
				addContributorToTracks === true &&
				addContributorToTracks !== addContributorToTracksPrevious
			) {
				await this.trackDraftService.addContributorToTracks(
					releaseContributor,
				);
			}
			if (
				addContributorToTracks === false &&
				addContributorToTracks !== addContributorToTracksPrevious
			) {
				await this.trackDraftService.deleteTrackContributor(
					releaseContributor,
				);
			}
		}
	}
}
