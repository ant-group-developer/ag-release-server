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

	async create(
		createTrackOriginTypeDto: CreateTrackOriginTypeDto,
	): Promise<TrackOriginType> {
		await this.validate({ name: createTrackOriginTypeDto.name });

		const trackOriginType = this.trackOriginTypeRepo.create(
			createTrackOriginTypeDto,
		);
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
		updateTrackOriginTypeDto: UpdateTrackOriginTypeDto,
	): Promise<TrackOriginType> {
		const { name } = updateTrackOriginTypeDto;
		const trackOriginType = await this.findOne(id);

		if (name && name !== trackOriginType.name) {
			await this.validate({ name });
		}

		await this.trackOriginTypeRepo.update(id, updateTrackOriginTypeDto);
		return await this.findOne(id);
	}

	async remove(id: string): Promise<void> {
		await this.trackOriginTypeRepo.delete(id);
	}

	async validate({ name }: { name?: string }) {
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
}
