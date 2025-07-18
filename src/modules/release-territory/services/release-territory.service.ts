import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { UpdateReleaseTerritoryDto } from '../dto/release-territory.dto';
import { ReleaseTerritory } from '../entities/release-territoty.entity';
import {
	ICreateReleaseTerritory,
	IUpdateReleaseTerritory,
} from '../interfaces/release-territory.interface';

@Injectable()
export class ReleaseTerritoryService {
	constructor(
		@InjectRepository(ReleaseTerritory)
		private readonly releaseTerritoryRepo: Repository<ReleaseTerritory>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	async create(data: ICreateReleaseTerritory) {
		const { releaseId } = data;

		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
		});

		if (!release) {
			throw new ResponseError({
				message: 'Invalid releaseId',
			});
		}

		const releaseTerritory = this.releaseTerritoryRepo.create(data);
		await this.releaseTerritoryRepo.save(releaseTerritory);
	}

	async findOne(id: string) {
		const releaseTerritory = await this.releaseTerritoryRepo.findOne({
			where: { id },
		});

		if (!releaseTerritory) {
			throw new ResponseError({ message: 'Release territory not found' });
		}

		return releaseTerritory;
	}

	async update({
		releaseTerritoryId,
		dataUpdate,
	}: {
		releaseTerritoryId: string;
		dataUpdate: IUpdateReleaseTerritory;
	}) {
		await this.findOne(releaseTerritoryId);
		await this.releaseTerritoryRepo.update(releaseTerritoryId, dataUpdate);
	}

	async handleUpdateReleaseTerritory({
		release,
		releaseTerritory,
	}: {
		release: Release;
		releaseTerritory?: UpdateReleaseTerritoryDto;
	}) {
		if (release.releaseTerritory?.id) {
			await this.update({
				releaseTerritoryId: release.releaseTerritory.id,
				dataUpdate: { ...releaseTerritory },
			});
		} else {
			await this.create({
				...releaseTerritory,
				releaseId: release.id,
			});
		}
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		await this.releaseTerritoryRepo.delete({ releaseId });
	}
}
