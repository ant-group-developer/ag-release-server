// service
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import * as unzipper from 'unzipper';
import { Release } from '../entities/metadata.entity';

@Injectable()
export class ParseDataCiService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {}

	async getRelease(filter: { releaseId?: number; label?: string }) {
		const qb = this.releaseRepo
			.createQueryBuilder('r')
			.leftJoinAndSelect('r.tracks', 't')
			.orderBy('r.release_id', 'DESC')
			.addOrderBy('t.track_number', 'ASC');

		if (filter.releaseId) {
			qb.andWhere('r.release_id = :releaseId', {
				releaseId: filter.releaseId,
			});
		}

		if (filter.label) {
			qb.andWhere('r.label ILIKE :label', {
				label: `%${filter.label}%`,
			});
		}

		return qb.getMany();
	}

	async findOne(id: number) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: ['tracks'],
			order: {
				tracks: {
					trackNumber: 'ASC',
				},
			},
		});

		if (!release) {
			throw new NotFoundException('Release not found');
		}

		return release;
	}

	async parseRelease(id: number) {
		const release = await this.findOne(id);

		const downloadDir = path.resolve('downloads');
		const unzipDir = path.resolve('download_unzip');

		const zipPath = path.join(downloadDir, `${id}.zip`);
		const targetDir = path.join(unzipDir, String(id));

		if (!fs.existsSync(zipPath)) {
			throw new Error(`ZIP_NOT_FOUND: ${zipPath}`);
		}

		fs.mkdirSync(targetDir, { recursive: true });

		await fs
			.createReadStream(zipPath)
			.pipe(unzipper.Extract({ path: targetDir }))
			.promise();
	}
}
