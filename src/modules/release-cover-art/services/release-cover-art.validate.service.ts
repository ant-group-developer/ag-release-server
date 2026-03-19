import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { FileEntity } from 'src/modules/bucket2/entities/bucket.file.entity';
import { Repository } from 'typeorm';
import { Release } from '../../release/entities/release.entity';
import { ReleaseCoverArtMessage } from '../constants/release-cover-art.constant';
import { ReleaseCoverArt } from '../entities/release-cover-art.entity';

@Injectable()
export class ReleaseCoverArtValidateService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,

		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,
	) {}

	async validate({
		releaseId,
		fileId,
	}: {
		releaseId?: string;
		fileId?: string;
	}) {
		if (releaseId) {
			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			if (!release) {
				throw new ResponseError(
					ReleaseCoverArtMessage.RELEASE_NOT_FOUND,
				);
			}
		}

		if (fileId) {
			const file = await this.fileRepo.findOne({
				where: { id: fileId },
			});

			if (!file) {
				throw new ResponseError({
					message: 'Error fileId',
				});
			}

			const releaseCoverArt = await this.releaseCoverArtRepo.findOne({
				where: { fileId },
			});

			if (releaseCoverArt) {
				throw new ResponseError({
					message: 'Error fileId',
				});
			}
		}
	}
}
