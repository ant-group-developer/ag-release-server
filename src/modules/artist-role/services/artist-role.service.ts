import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { mainArtistRole } from '../constants/artist-role.constant';
import {
	CreateArtistRoleDto,
	QueryGetListArtistRoleDto,
	UpdateArtistRoleDto,
} from '../dto/artist-role.dto';
import { ArtistRole } from '../entities/artist-role.entity';
import { ArtistRoleQueryService } from './artist-role.query.service';

@Injectable()
export class ArtistRoleService implements OnModuleInit {
	private readonly logger = new Logger(ArtistRoleService.name);

	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		private readonly artistRoleQueryService: ArtistRoleQueryService,
	) {}

	// init
	async onModuleInit() {
		await this.initMainArtistRole();
	}

	private async initMainArtistRole() {
		const mainArtistRoleDb = await this.artistRoleRepo.findOne({
			where: { name: mainArtistRole.name },
		});

		if (!mainArtistRoleDb) {
			this.logger.log('Initializing main artist role');

			const entity = this.artistRoleRepo.create({
				name: mainArtistRole.name,
				code: mainArtistRole.code,
			});

			await this.artistRoleRepo.save(entity);

			this.logger.log('Main artist role inserted successfully');
		} else {
			this.logger.log(
				'Artist role table already has data, skipping initialization',
			);
		}
	}

	// create
	async create(data: CreateArtistRoleDto): Promise<ArtistRole> {
		const { name, code } = data;
		await this.artistRoleQueryService.validate({ name, code });

		const artist = this.artistRoleRepo.create(data);
		return await this.artistRoleRepo.save(artist);
	}

	// read
	async findOne(id: string): Promise<ArtistRole> {
		const artistRole = await this.artistRoleRepo.findOne({ where: { id } });
		if (!artistRole) {
			throw new ResponseError({
				message: 'Artist role not found.',
				statusCode: 404,
			});
		}

		return artistRole;
	}

	async findOneWithCountRelation(id: string): Promise<ArtistRole> {
		const artistRole =
			await this.artistRoleQueryService.findOneWithCountRelation(id);
		if (!artistRole) {
			throw new ResponseError({
				message: 'Artist role not found.',
				statusCode: 404,
			});
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

	// update
	async update(id: string, data: UpdateArtistRoleDto): Promise<ArtistRole> {
		const { name, code } = data;
		const artistRole = await this.findOne(id);
		if (name && name !== artistRole.name) {
			await this.artistRoleQueryService.validate({ name });
		}

		if (code && code !== artistRole.code) {
			await this.artistRoleQueryService.validate({ code });
		}

		await this.artistRoleRepo.update(id, data);
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const artistRole = await this.findOneWithCountRelation(id);
		this.artistRoleQueryService.validateDelete(artistRole);

		await this.artistRoleRepo.delete(id);
	}
}
