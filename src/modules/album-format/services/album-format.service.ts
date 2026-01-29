import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import {
	AlbumFormatDefault,
	AlbumFormatMessage,
} from '../constant/album-format.constant';
import {
	CreateAlbumFormatDto,
	QueryGetListAlbumFormatDto,
	UpdateAlbumFormatDto,
} from '../dto/album-format.dto';
import { AlbumFormat } from '../entities/album-format.entity';
import { AlbumFormatQueryService } from './album-format.query.service';

@Injectable()
export class AlbumFormatService implements OnModuleInit {
	private readonly logger = new Logger(AlbumFormatService.name);

	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,

		private readonly albumFormatQueryService: AlbumFormatQueryService,
	) {}

	// init data
	async onModuleInit() {
		await this.initializeData();
	}

	private async initializeData() {
		const recordCount = await this.albumFormatRepo.count();

		if (recordCount === 0) {
			this.logger.log('Initializing album format');

			await Promise.all(
				AlbumFormatDefault.map((item) => this.create(item)),
			).catch((e) => {
				this.logger.error(e);
			});
		} else {
			this.logger.log(
				'Album format already has data, skipping initialization',
			);
		}
	}

	// create
	async create(data: CreateAlbumFormatDto): Promise<AlbumFormat> {
		const { name, code } = data;

		await this.albumFormatQueryService.validate({ name, code });
		const albumFormat = this.albumFormatRepo.create(data);
		return await this.albumFormatRepo.save(albumFormat);
	}

	// read
	async findOne(id: string): Promise<AlbumFormat> {
		const albumFormat = await this.albumFormatRepo.findOne({
			where: { id },
		});

		if (!albumFormat) {
			throw new ResponseError(AlbumFormatMessage.NOT_FOUND);
		}
		return albumFormat;
	}

	private async findOneWithCountRelation(id: string): Promise<AlbumFormat> {
		const albumFormat =
			await this.albumFormatQueryService.findOneWithCountRelation(id);

		if (!albumFormat) {
			throw new ResponseError(AlbumFormatMessage.NOT_FOUND);
		}
		return albumFormat;
	}

	async getList(
		query: QueryGetListAlbumFormatDto,
	): Promise<PageDto<AlbumFormat>> {
		const { page, pageSize } = query;

		const [albumFormats, totalItems] =
			await this.albumFormatQueryService.getList(query);

		return new PageDto({
			items: albumFormats,
			metadata: {
				page: page,
				pageSize,
				totalItems,
			},
		});
	}

	async getListSimple() {
		return this.albumFormatQueryService.getListSimple();
	}

	async update(id: string, data: UpdateAlbumFormatDto): Promise<AlbumFormat> {
		const { code, name } = data;

		const albumFormat = await this.findOne(id);

		if (name && name !== albumFormat.name) {
			await this.albumFormatQueryService.validate({ name });
		}
		if (code && code !== albumFormat.code) {
			await this.albumFormatQueryService.validate({ code });
		}

		await this.albumFormatRepo.update(id, data);
		return this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const albumFormat = await this.findOneWithCountRelation(id);
		this.albumFormatQueryService.validateDelete(albumFormat);
		await this.albumFormatRepo.delete(id);
	}
}
