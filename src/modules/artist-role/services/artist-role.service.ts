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
import { ArtistRoleQbService } from './artist-role.qb.service';

@Injectable()
export class ArtistRoleService {
	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		private readonly artistRoleQbService: ArtistRoleQbService,
	) {}

	async create(
		createArtistRoleDto: CreateArtistRoleDto,
	): Promise<ArtistRole> {
		const { name } = createArtistRoleDto;
		await this.validate({ name });

		const artist = this.artistRoleRepo.create(createArtistRoleDto);
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

		const queryGetList = this.artistRoleQbService.createQueryGetList(query);

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

	async update(
		id: string,
		updateArtistRoleDto: UpdateArtistRoleDto,
	): Promise<ArtistRole> {
		const { name } = updateArtistRoleDto;
		const artistRole = await this.findOne(id);
		if (name && name !== artistRole.name) {
			await this.validate({ name });
		}

		await this.artistRoleRepo.update(id, updateArtistRoleDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.artistRoleRepo.delete(id);
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
