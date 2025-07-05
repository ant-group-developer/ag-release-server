import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
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
	) {}

	async validate({ releaseId }: { releaseId?: string }) {
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
	}
}
