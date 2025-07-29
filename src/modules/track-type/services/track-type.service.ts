import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	TrackTypeMessageCodeError,
	TrackTypeMessageError,
} from '../constants/track-type.constant';
import {
	CreateTrackTypeDto,
	QueryGetListTrackTypeDto,
	UpdateTrackTypeDto,
} from '../dto/track-type.dto';
import { TrackType } from '../entities/track-type.entity';
import { TrackTypeQueryService } from './track-type.query.service';

@Injectable()
export class TrackTypeService {
	constructor(
		@InjectRepository(TrackType)
		private readonly trackTypeRepo: Repository<TrackType>,

		private readonly trackTypeQueryService: TrackTypeQueryService,
	) {}

	async create(createTrackTypeDto: CreateTrackTypeDto): Promise<TrackType> {
		await this.validate({ name: createTrackTypeDto.name });

		const trackType = this.trackTypeRepo.create(createTrackTypeDto);
		return await this.trackTypeRepo.save(trackType);
	}

	async findOne(id: string): Promise<TrackType> {
		const trackType = await this.trackTypeRepo.findOne({ where: { id } });
		if (!trackType) {
			throw new ResponseError({
				message: TrackTypeMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return trackType;
	}

	async getList(
		query: QueryGetListTrackTypeDto,
	): Promise<PageDto<TrackType>> {
		const { page, pageSize } = query;

		const queryGetList =
			this.trackTypeQueryService.createQueryGetList(query);

		const [trackTypes, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items: trackTypes,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	async update(
		id: string,
		updateTrackTypeDto: UpdateTrackTypeDto,
	): Promise<TrackType> {
		const { name } = updateTrackTypeDto;
		const trackType = await this.findOne(id);

		if (name && name !== trackType.name) {
			await this.validate({ name });
		}

		await this.trackTypeRepo.update(id, updateTrackTypeDto);
		return await this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const trackType =
			await this.trackTypeQueryService.findOneWithCountRelation(id);

		if (!trackType) {
			throw new ResponseError({
				message: TrackTypeMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		if ((trackType.tracksCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					TrackTypeMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				messageCode:
					TrackTypeMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				statusCode: 400,
			});
		}

		await this.trackTypeRepo.delete(id);
	}

	async validate({ name }: { name?: string }) {
		const trackType = await this.trackTypeRepo.findOne({ where: { name } });

		if (trackType) {
			throw new ResponseError({
				messageCode:
					TrackTypeMessageCodeError.DUPLICATE_NAME_TRACK_TYPE,
				message: TrackTypeMessageError.DUPLICATE_NAME_TRACK_TYPE,
			});
		}
	}
}
