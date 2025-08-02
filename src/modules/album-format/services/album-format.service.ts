import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
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
export class AlbumFormatService {
	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,

		private readonly albumFormatQueryService: AlbumFormatQueryService,
	) {}

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

	async remove(id: string): Promise<void> {
		await this.findOne(id);
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
