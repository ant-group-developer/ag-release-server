import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { ReleaseLanguage } from '../entities/release-language.entity';

@Injectable()
export class ReleaseLanguageQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,
	) {
		this.mainAlias = 'releaseLanguage';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	async findOne(id: string): Promise<ReleaseLanguage> {
		const releaseLanguage = await this.releaseLanguageRepo.findOne({
			where: { id },
		});

		if (!releaseLanguage) {
			throw new ResponseError({
				message: 'Not found release language',
				statusCode: 404,
			});
		}

		return releaseLanguage;
	}
}
