import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Repository } from 'typeorm';
import {
	ReleaseMessageCodeError,
	ReleaseMessageError,
} from '../constants/release.constant';

@Injectable()
export class ReleaseValidateService {
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
	) {}

	async validate({
		primaryGenreId,
		subGenreId,
		labelId,
	}: {
		primaryGenreId?: string;
		subGenreId?: string | null;
		labelId?: string;
	}) {
		if (primaryGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: primaryGenreId },
			});

			if (!genre) {
				throw new ResponseError({
					message: ReleaseMessageError.PRIMARY_GENRE_NOT_FOUND,
					messageCode:
						ReleaseMessageCodeError.PRIMARY_GENRE_NOT_FOUND,
				});
			}
		}

		if (subGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: subGenreId },
			});
			if (!genre) {
				throw new ResponseError({
					message: ReleaseMessageError.SUB_GENRE_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.SUB_GENRE_NOT_FOUND,
				});
			}
		}

		if (labelId) {
			const label = await this.labelRepo.findOne({
				where: { id: labelId },
			});
			if (!label) {
				throw new ResponseError({
					message: ReleaseMessageError.LABEL_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.LABEL_NOT_FOUND,
				});
			}
		}
	}
}
