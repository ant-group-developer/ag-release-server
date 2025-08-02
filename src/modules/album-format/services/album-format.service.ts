import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	AlbumFormatDefault,
	AlbumFormatMessageCodeError,
	AlbumFormatMessageError,
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

	async create(data: CreateAlbumFormatDto): Promise<AlbumFormat> {
		await this.validate({ name: data.name, value: data.value });
		const albumFormat = this.albumFormatRepo.create(data);
		return await this.albumFormatRepo.save(albumFormat);
	}

	async findOne(id: string): Promise<AlbumFormat> {
		const albumFormat = await this.albumFormatRepo.findOne({
			where: { id },
		});

		if (!albumFormat) {
			throw new ResponseError({
				message: AlbumFormatMessageError.NOT_FOUND,
				messageCode: AlbumFormatMessageCodeError.NOT_FOUND,
				statusCode: 404,
			});
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
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(id: string, data: UpdateAlbumFormatDto): Promise<AlbumFormat> {
		const { value, name } = data;

		const albumFormat = await this.findOne(id);

		if (name && name !== albumFormat.name) {
			await this.validate({ name });
		}
		if (value && value !== albumFormat.value) {
			await this.validate({ value });
		}

		await this.albumFormatRepo.update(id, data);
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const albumFormat =
			await this.albumFormatQueryService.findOneWithCountRelation(id);

		if (!albumFormat) {
			throw new ResponseError({
				message: AlbumFormatMessageError.NOT_FOUND,
				messageCode: AlbumFormatMessageCodeError.NOT_FOUND,
				statusCode: 404,
			});
		}

		if ((albumFormat?.releasesCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					AlbumFormatMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					AlbumFormatMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}
		await this.albumFormatRepo.delete(id);
	}

	async validate({
		name,
		value,
	}: {
		name?: string;
		value?: string;
	}): Promise<void> {
		if (name) {
			const existingName = await this.albumFormatRepo.findOne({
				where: { name },
			});

			if (existingName) {
				throw new ResponseError({
					message:
						AlbumFormatMessageError.DUPLICATE_NAME_ALBUM_FORMAT,
					messageCode:
						AlbumFormatMessageCodeError.DUPLICATE_NAME_ALBUM_FORMAT,
					statusCode: 409,
				});
			}
		}

		if (value) {
			const existingValue = await this.albumFormatRepo.findOne({
				where: { value },
			});

			if (existingValue) {
				throw new ResponseError({
					message:
						AlbumFormatMessageError.DUPLICATE_VALUE_ALBUM_FORMAT,
					messageCode:
						AlbumFormatMessageCodeError.DUPLICATE_VALUE_ALBUM_FORMAT,
					statusCode: 409,
				});
			}
		}
	}
}
