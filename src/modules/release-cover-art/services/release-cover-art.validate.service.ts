import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { FileEntity } from 'src/modules/bucket/entities/bucket.file.entity';
import { Repository } from 'typeorm';
import { Release } from '../../release/entities/release.entity';
import {
	ReleaseCoverArtMessageCodeError,
	ReleaseCoverArtMessageError,
} from '../constants/release-cover-art.constant';

@Injectable()
export class ReleaseCoverArtValidateService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(FileEntity)
		private readonly fileRepo: Repository<FileEntity>,
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
				throw new ResponseError({
					message: ReleaseCoverArtMessageError.RELEASE_NOT_FOUND,
					messageCode:
						ReleaseCoverArtMessageCodeError.RELEASE_NOT_FOUND,
				});
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
		}
	}
}
