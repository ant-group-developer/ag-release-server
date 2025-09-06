import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackTypeMessages } from '../constants/track-type.constant';
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

	// create
	async create(data: CreateTrackTypeDto, userId: string): Promise<TrackType> {
		const { name, code } = data;
		await this.trackTypeQueryService.validate({ name, code });

		const trackType = this.trackTypeRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return await this.trackTypeRepo.save(trackType);
	}

	// read
	async findOne(id: string): Promise<TrackType> {
		const trackType = await this.trackTypeRepo.findOne({ where: { id } });
		if (!trackType) {
			throw new ResponseError(TrackTypeMessages.NOT_FOUND);
		}

		return trackType;
	}

	private async findOneWithCountRelation(id: string): Promise<TrackType> {
		const trackType =
			await this.trackTypeQueryService.findOneWithCountRelation(id);

		if (!trackType) {
			throw new ResponseError(TrackTypeMessages.NOT_FOUND);
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

	async getListSimple() {
		return await this.trackTypeRepo.find({
			select: ['id', 'name', 'code'],
		});
	}

	// update
	async update(
		id: string,
		data: UpdateTrackTypeDto,
		userId: string,
	): Promise<TrackType> {
		const { name, code } = data;
		const trackType = await this.findOne(id);

		if (name && name !== trackType.name) {
			await this.trackTypeQueryService.validate({ name });
		}

		if (code && code !== trackType.code) {
			await this.trackTypeQueryService.validate({ code });
		}

		await this.trackTypeRepo.update(id, { ...data, modifierId: userId });
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const trackType = await this.findOneWithCountRelation(id);
		this.trackTypeQueryService.validateDelete(trackType);
		await this.trackTypeRepo.delete(id);
	}
}
