import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseArtistMessageError } from '../constants/release-artist.constant';
import {
	CreateReleaseArtistDto,
	QueryGetListReleaseArtistDto,
	UpdateReleaseArtistDto,
} from '../dto/release-artist.dto';
import { ReleaseArtist } from '../entities/release-artist.entity';
import { ReleaseArtistValidateService } from './release-artist.validate.service';

@Injectable()
export class ReleaseArtistService {
	constructor(
		@InjectRepository(ReleaseArtist)
		private readonly releaseArtistRepo: Repository<ReleaseArtist>,

		private readonly releaseArtistValidateService: ReleaseArtistValidateService,
	) {}

	async create(
		createReleaseArtistDto: CreateReleaseArtistDto,
	): Promise<ReleaseArtist> {
		const { artistId, artistRoleId, releaseId } = createReleaseArtistDto;

		await this.releaseArtistValidateService.validate({
			artistId,
			artistRoleId,
			releaseId,
		});

		const releaseArtist = this.releaseArtistRepo.create(
			createReleaseArtistDto,
		);
		return await this.releaseArtistRepo.save(releaseArtist);
	}

	async findOne(id: string): Promise<ReleaseArtist> {
		const releaseArtist = await this.releaseArtistRepo.findOne({
			where: { id },
		});

		if (!releaseArtist) {
			throw new ResponseError({
				message: ReleaseArtistMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return releaseArtist;
	}

	async getList(
		query: QueryGetListReleaseArtistDto,
	): Promise<PageDto<ReleaseArtist>> {
		const { page, pageSize, skip } = query;

		const [releaseArtists, totalItems] =
			await this.releaseArtistRepo.findAndCount({
				skip,
				take: pageSize,
			});

		return new PageDto({
			items: releaseArtists,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateReleaseArtistDto: UpdateReleaseArtistDto,
	): Promise<ReleaseArtist> {
		const { artistId, artistRoleId, releaseId } = updateReleaseArtistDto;

		const releaseArtist = await this.findOne(id);

		if (artistId && artistId !== releaseArtist.artistId) {
			await this.releaseArtistValidateService.validate({
				artistId,
			});
		}

		if (artistRoleId && artistRoleId !== releaseArtist.artistRoleId) {
			await this.releaseArtistValidateService.validate({
				artistRoleId,
			});
		}

		if (releaseId && releaseId !== releaseArtist.releaseId) {
			await this.releaseArtistValidateService.validate({
				releaseId,
			});
		}

		await this.releaseArtistRepo.update(id, updateReleaseArtistDto);
		return await this.findOne(id);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		await this.releaseArtistRepo.delete({ releaseId });
	}

	async remove(id: string): Promise<void> {
		await this.releaseArtistRepo.delete(id);
	}
}
