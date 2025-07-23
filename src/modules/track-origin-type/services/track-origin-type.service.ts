import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	TrackOriginTypeMessageCodeError,
	TrackOriginTypeMessageError,
} from '../constants/track-origin-type.constant';
import {
	CreateTrackOriginTypeDto,
	QueryGetListTrackOriginTypeDto,
	UpdateTrackOriginTypeDto,
} from '../dto/track-origin-type.dto';
import { TrackOriginType } from '../entities/track-origin-type.entity';
import { TrackOriginTypeQueryService } from './track-origin-type.query.service';

@Injectable()
export class TrackOriginTypeService {
	constructor(
		@InjectRepository(TrackOriginType)
		private readonly trackOriginTypeRepo: Repository<TrackOriginType>,

		private readonly trackOriginTypeQueryService: TrackOriginTypeQueryService,
	) {}

	async create(data: CreateTrackOriginTypeDto): Promise<TrackOriginType> {
		const { name, value } = data;

		await this.validate({ name });
		await this.validate({ value });

		const trackOriginType = this.trackOriginTypeRepo.create(data);

		return await this.trackOriginTypeRepo.save(trackOriginType);
	}

	async findOne(id: string): Promise<TrackOriginType> {
		const trackOriginType = await this.trackOriginTypeRepo.findOne({
			where: { id },
		});
		if (!trackOriginType) {
			throw new ResponseError({
				message: TrackOriginTypeMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return trackOriginType;
	}

	async getList(
		query: QueryGetListTrackOriginTypeDto,
	): Promise<PageDto<TrackOriginType>> {
		const { page, pageSize } = query;

		const queryGetList =
			this.trackOriginTypeQueryService.createQueryGetList(query);

		const [trackOriginTypes, totalItems] =
			await queryGetList.getManyAndCount();

		return new PageDto({
			items: trackOriginTypes,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		data: UpdateTrackOriginTypeDto,
	): Promise<TrackOriginType> {
		const { name, value } = data;
		const trackOriginType = await this.findOne(id);

		if (name && name !== trackOriginType.name) {
			await this.validate({ name });
		}

		if (value && value !== trackOriginType.value) {
			await this.validate({ value });
		}

		await this.trackOriginTypeRepo.update(id, data);
		return await this.findOne(id);
	}

	// async delete(id: string): Promise<void> {
	// 	await this.trackOriginTypeRepo.delete(id);
	// }

	async delete(id: string): Promise<void> {
		const originType =
			await this.trackOriginTypeQueryService.findOneWithCountRelation(id);

		if (!originType) {
			throw new ResponseError({
				message: 'Track origin type not found.',
				statusCode: 404,
			});
		}

		if ((originType.tracksCount ?? 0) > 0) {
			throw new ResponseError({
				message: `Cannot delete this track origin type because it is linked to ${originType.tracksCount} track(s).`,
				statusCode: 400,
			});
		}

		await this.trackOriginTypeRepo.delete(id);
	}

	async validate({ name, value }: { name?: string; value?: string }) {
		if (name) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { name },
			});

			if (trackOriginType) {
				throw new ResponseError({
					messageCode:
						TrackOriginTypeMessageCodeError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
					message:
						TrackOriginTypeMessageError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
				});
			}
		}

		if (value) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { value },
			});

			if (trackOriginType) {
				throw new ResponseError({
					messageCode:
						TrackOriginTypeMessageCodeError.DUPLICATE_VALUE_TRACK_ORIGIN_TYPE,
					message:
						TrackOriginTypeMessageError.DUPLICATE_VALUE_TRACK_ORIGIN_TYPE,
				});
			}
		}
	}
}
