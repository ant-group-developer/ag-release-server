import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
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
	) {}

	async create(data: ICreateReleaseTerritory): Promise<ReleaseTerritory> {
		const releaseTerritory = this.releaseTerritoryRepo.create(data);
		return await this.releaseTerritoryRepo.save(releaseTerritory);
	}

	async update(
		id: string,
		data: IUpdateReleaseTerritory,
	): Promise<ReleaseTerritory> {
		await this.releaseTerritoryRepo.update(id, data);
		const result = await this.releaseTerritoryRepo.findOne({
			where: { id },
		});

		if (!result) {
			throw new ResponseError({ message: 'Release territory not found' });
		}

		return result;
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		await this.releaseTerritoryRepo.delete({ releaseId });
	}
}
