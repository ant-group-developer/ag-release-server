import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from '../entities/artist.entity';

@Injectable()
export class ArtistValidateService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
	) {}

	async validate({ name }: { name: string }) {
		const artist = await this.artistRepo.findOne({
			where: { name },
		});

		if (artist) {
			throw new BadRequestException(
				'Artist with this name already exists',
			);
		}
	}
}
