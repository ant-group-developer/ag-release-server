import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ResponseError } from 'src/common/dtos/response.dto';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { ensureUUID } from 'src/utils/util';
import { Repository } from 'typeorm';

import { ArtistProfileMessage } from './constants/artist-profile.constants';
import { ArtistProfile } from './entities/artist-profile.entity';
import {
	IBulkUpdateArtistProfile,
	ICreateArtistProfile,
	IUpdateArtistProfile,
} from './interfaces/artist-profile.interface';

@Injectable()
export class ArtistProfileService {
	constructor(
		@InjectRepository(ArtistProfile)
		private readonly artistProfileRepo: Repository<ArtistProfile>,

		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,

		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
	) {}

	//create
	async bulkCreate(data: ICreateArtistProfile[]) {
		const result = await Promise.all(
			data.map((item) => this.create(item).catch((_e) => {})),
		);

		return result.filter(Boolean) as ArtistProfile[];
	}

	private async create(data: ICreateArtistProfile) {
		const { artistId, dspId } = data;
		await this.validate({ artistId, dspId });

		const artistProfile = this.artistProfileRepo.create(data);
		return await this.artistProfileRepo.save(artistProfile);
	}

	// update
	async bulkUpdate(data: IBulkUpdateArtistProfile[]) {
		await Promise.all(
			data.map(({ id, ...rest }) =>
				this.update(id, rest).catch((_e) => {}),
			),
		);
	}

	private async update(id: string, data: IUpdateArtistProfile) {
		const { artistId, dspId } = data;

		await this.validate({ artistId, dspId });
		await this.artistProfileRepo.update(id, data);
	}

	// delete
	async delete(id: string) {
		ensureUUID(id);
		await this.artistProfileRepo.delete(id);
	}

	// validate
	private async validate({
		dspId,
		artistId,
	}: {
		dspId?: string;
		artistId?: string;
	}) {
		if (dspId) {
			const dsp = await this.dspRepo.findOne({
				where: { id: dspId },
			});

			if (!dsp) {
				throw new ResponseError(ArtistProfileMessage.DSP_NOT_FOUND);
			}
		}

		if (artistId) {
			const artist = await this.artistRepo.findOne({
				where: { id: artistId },
			});

			if (!artist) {
				throw new ResponseError(ArtistProfileMessage.ARTIST_NOT_FOUND);
			}
		}
	}
}
