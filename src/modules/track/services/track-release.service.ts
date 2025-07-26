import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TrackReleaseService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	async getReleaseById(id: string): Promise<Release | null> {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				releaseLanguage: true,
			},
		});

		return release;
	}
}
