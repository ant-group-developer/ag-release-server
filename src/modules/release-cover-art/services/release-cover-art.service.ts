import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BucketService } from 'src/modules/bucket/services/bucket.service';
import { Repository } from 'typeorm';
import { ReleaseCoverArt } from '../entities/release-cover-art.entity';
import {
	ICreateReleaseCoverArt,
	IUpdateReleaseCoverArt,
} from '../interface/release-cover-art.interface';
import { ReleaseCoverArtValidateService } from './release-cover-art.validate.service';

@Injectable()
export class ReleaseCoverArtService {
	constructor(
		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,

		private readonly releaseCoverArtValidateService: ReleaseCoverArtValidateService,
		private readonly bucketService: BucketService,
	) {}

	// async create(data: ICreateReleaseCoverArt): Promise<ReleaseCoverArt> {
	// 	const { releaseId, fileId } = data;
	// 	await this.releaseCoverArtValidateService.validate({
	// 		releaseId,
	// 		fileId,
	// 	});

	// 	const releaseCoverArt = this.releaseCoverArtRepo.create(data);
	// 	return await this.releaseCoverArtRepo.save(releaseCoverArt);
	// }

	async bulkCreate(
		data: ICreateReleaseCoverArt[],
	): Promise<ReleaseCoverArt[]> {
		const releaseCoverArt = this.releaseCoverArtRepo.create(data);
		return await this.releaseCoverArtRepo.save(releaseCoverArt);
	}

	async bulkUpdate(
		data: IUpdateReleaseCoverArt[],
	): Promise<ReleaseCoverArt[]> {
		const releaseCoverArt = this.releaseCoverArtRepo.create(data);
		return await this.releaseCoverArtRepo.save(releaseCoverArt);
	}

	// async update({
	// 	id,
	// 	dataUpdate,
	// }: {
	// 	id: string;
	// 	dataUpdate: IUpdateReleaseCoverArt;
	// }): Promise<ReleaseCoverArt> {
	// 	const { releaseId, fileId } = dataUpdate;
	// 	const releaseCoverArt = await this.findOne(id);

	// 	if (releaseId && releaseId !== releaseCoverArt.releaseId) {
	// 		await this.releaseCoverArtValidateService.validate({
	// 			releaseId,
	// 		});
	// 	}

	// 	if (fileId && fileId !== releaseCoverArt.fileId) {
	// 		await this.releaseCoverArtValidateService.validate({
	// 			fileId,
	// 		});

	// 		await this.bucketService.remove(fileId);
	// 	}

	// 	await this.releaseCoverArtRepo.update(id, dataUpdate);
	// 	return this.findOne(id);
	// }

	// async findOne(id: string) {
	// 	const releaseCoverArt = await this.releaseCoverArtRepo.findOne({
	// 		where: { id },
	// 	});

	// 	if (!releaseCoverArt) {
	// 		throw new ResponseError({ message: 'Release cover art not found' });
	// 	}

	// 	return releaseCoverArt;
	// }

	async delete(id: string) {
		await this.releaseCoverArtRepo.delete(id);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		await this.releaseCoverArtRepo.delete({ releaseId });
	}
}
