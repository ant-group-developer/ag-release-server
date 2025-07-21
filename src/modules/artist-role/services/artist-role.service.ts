import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	ArtistRoleMessageCodeError,
	ArtistRoleMessageError,
} from '../constants/artist-role.constant';
import {
	CreateArtistRoleDto,
	QueryGetListArtistRoleDto,
	UpdateArtistRoleDto,
} from '../dto/artist-role.dto';
import { ArtistRole } from '../entities/artist-role.entity';
import { ArtistRoleQueryService } from './artist-role.query.service';

@Injectable()
export class ArtistRoleService {
	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		private readonly artistRoleQueryService: ArtistRoleQueryService,
	) {}

	async create(data: CreateArtistRoleDto): Promise<ArtistRole> {
		const { name } = data;
		await this.validate({ name });

		const artist = this.artistRoleRepo.create(data);
		return await this.artistRoleRepo.save(artist);
	}

	async findOne(id: string): Promise<ArtistRole> {
		const artistRole = await this.artistRoleRepo.findOne({ where: { id } });
		if (!artistRole) {
			throw new BadRequestException('Not found');
		}

		return artistRole;
	}

	async getList(
		query: QueryGetListArtistRoleDto,
	): Promise<PageDto<ArtistRole>> {
		const { page, pageSize } = query;

		const queryGetList =
			this.artistRoleQueryService.createQueryGetList(query);

		const [artistRoles, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: artistRoles,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateArtistRoleDto): Promise<ArtistRole> {
		const { name } = data;
		const artistRole = await this.findOne(id);
		if (name && name !== artistRole.name) {
			await this.validate({ name });
		}

		await this.artistRoleRepo.update(id, data);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const artistRole =
			await this.artistRoleQueryService.findOneWithCountRelation(id);
		this.validateDelete(artistRole);

		await this.artistRoleRepo.delete(id);
	}

	// validate
	private validateDelete(artistRole: ArtistRole | null) {
		if (!artistRole) {
			throw new ResponseError({
				message: 'Artist role not found.',
				statusCode: 404,
			});
		}

		if ((artistRole.releaseCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this artist role because it is linked to ${artistRole.releaseCount} release(s).`,
				statusCode: 400,
			});
		}

		if ((artistRole.trackCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this artist role because it is linked to ${artistRole.trackCount} track(s).`,
				statusCode: 400,
			});
		}
	}

	async validate({ name }: { name?: string }) {
		if (name) {
			const artistRole = await this.artistRoleRepo.findOne({
				where: { name },
			});

			if (artistRole) {
				throw new ResponseError({
					message: ArtistRoleMessageError.DUPLICATE_NAME_ARTIST_ROLE,
					messageCode:
						ArtistRoleMessageCodeError.DUPLICATE_NAME_ARTIST_ROLE,
					statusCode: 409,
				});
			}
		}
	}
}
