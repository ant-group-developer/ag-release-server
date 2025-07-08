import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import {
	CreateReleaseCoverArtDto,
	UpdateReleaseCoverArtDto,
} from '../dto/release-cover-art.dto';
import { ReleaseCoverArt } from '../entities/release-cover-art.entity';
import { ReleaseCoverArtValidateService } from './release-cover-art.validate.service';

@Injectable()
export class ReleaseCoverArtService {
	constructor(
		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,

		private readonly releaseCoverArtValidateService: ReleaseCoverArtValidateService,
		private readonly bucketService: BucketService,
	) {}

	async create(data: CreateReleaseCoverArtDto): Promise<ReleaseCoverArt> {
		const { releaseId, fileId } = data;
		await this.releaseCoverArtValidateService.validate({
			releaseId,
			fileId,
		});
		await this.bucketService.submit(fileId);

		const releaseCoverArt = this.releaseCoverArtRepo.create(data);
		return await this.releaseCoverArtRepo.save(releaseCoverArt);
	}

	async update(
		id: string,
		data: UpdateReleaseCoverArtDto,
	): Promise<ReleaseCoverArt> {
		const { releaseId, fileId } = data;
		const releaseCoverArt = await this.findOne(id);

		if (releaseId && releaseId !== releaseCoverArt.releaseId) {
			await this.releaseCoverArtValidateService.validate({
				releaseId,
			});
		}

		if (fileId && fileId !== releaseCoverArt.fileId) {
			await this.releaseCoverArtValidateService.validate({
				fileId,
			});

			await this.bucketService.remove(fileId);
			await this.bucketService.submit(fileId);
		}

		await this.releaseCoverArtRepo.update(id, data);
		return this.findOne(id);
	}

	async findOne(id: string) {
		const releaseCoverArt = await this.releaseCoverArtRepo.findOne({
			where: { id },
		});

		if (!releaseCoverArt) {
			throw new ResponseError({ message: 'Release cover art not found' });
		}

		return releaseCoverArt;
	}
}
