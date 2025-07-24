import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { Repository } from 'typeorm';
import {
	ReleaseMessageCodeError,
	ReleaseMessageError,
} from '../constants/release.constant';
import { UpdateReleaseDraftDto } from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import {
	IRelease,
	IReleaseDraft,
	IReleaseNonDraft,
	ReleaseSchema,
} from '../interfaces/release.interface';

@Injectable()
export class ReleaseValidateService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,

		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,
	) {}

	async validate({
		primaryGenreId,
		subGenreId,
		labelId,
		releaseTimezoneId,
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		labelId?: string | null;
		releaseTimezoneId?: string | null;
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

		if (releaseTimezoneId) {
			const timezone = await this.timezoneRepo.findOne({
				where: { id: releaseTimezoneId },
			});

			if (!timezone) {
				throw new ResponseError({
					message: ReleaseMessageError.TIMEZONE_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.TIMEZONE_NOT_FOUND,
				});
			}
		}
	}

	ensureNonDraftRelease(release: IRelease): IReleaseNonDraft {
		if (release.status === ReleaseStatus.DRAFT) {
			throw new ResponseError({ message: 'Invalid release.status' });
		}

		if (!release.primaryGenreId) {
			throw new ResponseError({
				message: 'Invalid release.primaryGenreId',
			});
		}

		if (!release.labelId) {
			throw new ResponseError({
				message: 'Invalid release.labelId',
			});
		}

		if (!release.cLineOwner) {
			throw new ResponseError({
				message: 'Invalid release.cLineOwner',
			});
		}

		if (!release.pLineOwner) {
			throw new ResponseError({
				message: 'Invalid release.pLineOwner',
			});
		}

		if (!release.releaseDate) {
			throw new ResponseError({
				message: 'Invalid release.releaseDate',
			});
		}

		return release as IReleaseNonDraft;
	}

	ensureDraftRelease(release: IRelease): IReleaseDraft {
		if (release.status !== ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Invalid release.status',
			});
		}

		return release as IReleaseDraft;
	}

	async handleValidateDataUpdate({
		release,
		dataUpdate,
	}: {
		release: Release;
		dataUpdate: UpdateReleaseDraftDto;
	}) {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			dataUpdate;

		if (labelId && labelId !== release.labelId) {
			await this.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.validate({
				releaseTimezoneId,
			});
		}
	}

	async validateSchemaRelease(id: string) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				tracks: { audioFile: true },
			},
		});

		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				messageCode: ReleaseMessageCodeError.NOT_FOUND,
			});
		}

		const validationResult = ReleaseSchema.safeParse(release);

		if (!validationResult.success) {
			return validationResult.error.errors;
		}

		return release;
	}
}
