import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import {
	dataInitArtistRole,
	mainArtistRole,
} from '../constants/artist-role.constant';
import {
	CreateArtistRoleDto,
	QueryGetListArtistRoleDto,
	UpdateArtistRoleDto,
} from '../dto/artist-role.dto';
import { ArtistRole } from '../entities/artist-role.entity';
import { ArtistRoleQueryService } from './artist-role.query.service';
import { AppConfigService } from 'src/modules/app-config/app-config.service';

@Injectable()
export class ArtistRoleService implements OnModuleInit {
	private readonly logger = new Logger(ArtistRoleService.name);

	constructor(
		@InjectRepository(ArtistRole)
		private readonly artistRoleRepo: Repository<ArtistRole>,

		private readonly artistRoleQueryService: ArtistRoleQueryService,
		private readonly appConfigService: AppConfigService,
	) {}

	// init
	async onModuleInit() {
		// await this.initMainArtistRole();
	}

	private async initMainArtistRole() {
		const count = await this.artistRoleRepo.count();
		if (count === 0) {
			this.logger.log('Initializing artist role');

			const entities = this.artistRoleRepo.create(dataInitArtistRole);
			await this.artistRoleRepo.save(entities);

			this.logger.log('Main artist role inserted successfully');
		} else {
			this.logger.log(
				'Artist role table already has data, skipping initialization',
			);
		}

		const mainIsExist = await this.artistRoleRepo.findOne({
			where: { code: mainArtistRole.code },
		});

		if (!mainIsExist) {
			// throw new ResponseError({ message: 'Main artist is required' });
		}
	}

	// create
	async create(
		data: CreateArtistRoleDto,
		userId: string,
	): Promise<ArtistRole> {
		const { name, code } = data;

		await this.artistRoleQueryService.validate({ name, code });

		const artist = this.artistRoleRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		const result = await this.artistRoleRepo.save(artist);
		await this.appConfigService.refreshRequiredArtistRoles();
		return result;
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
				page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple() {
		return this.artistRoleRepo
			.createQueryBuilder('ar')
			.select(['ar.id', 'ar.code', 'ar.name'])
			.getMany();
	}

	// update
	async update(
		id: string,
		data: UpdateArtistRoleDto,
		userId: string,
	): Promise<ArtistRole> {
		const { name, code } = data;
		const artistRole = await this.findOne(id);
		if (name && name !== artistRole.name) {
			await this.artistRoleQueryService.validate({ name });
		}

		if (code && code !== artistRole.code) {
			await this.artistRoleQueryService.validate({ code });
		}

		await this.artistRoleRepo.update(id, { ...data, modifierId: userId });
		await this.appConfigService.refreshRequiredArtistRoles();
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		await this.artistRoleRepo.delete(id);
		await this.appConfigService.refreshRequiredArtistRoles();
	}
}
