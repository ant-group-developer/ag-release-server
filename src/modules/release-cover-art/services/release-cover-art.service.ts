import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReleaseCoverArtDto } from '../dto/release-cover-art.dto';
import { ReleaseCoverArt } from '../entities/release-cover-art.entity';
import { ReleaseCoverArtValidateService } from './release-cover-art.validate.service';

@Injectable()
export class ReleaseCoverArtService {
	constructor(
		@InjectRepository(ReleaseCoverArt)
		private readonly releaseCoverArtRepo: Repository<ReleaseCoverArt>,

		private readonly releaseCoverArtValidateService: ReleaseCoverArtValidateService,

		private readonly configService: ConfigService,
	) {}

	async create(data: CreateReleaseCoverArtDto): Promise<ReleaseCoverArt> {
		const { fileName, releaseId } = data;
		await this.releaseCoverArtValidateService.validate({ releaseId });
		const key = `releases/${fileName}`;

		const releaseCoverArt = this.releaseCoverArtRepo.create({
			...data,
			key,
			bucket: this.configService.get<string>('PUBLIC_BUCKET')!,
		});

		return await this.releaseCoverArtRepo.save(releaseCoverArt);
	}
}
