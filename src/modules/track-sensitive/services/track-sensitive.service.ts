import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { TrackSensitiveMessage } from '../constants/track-sensitive.const';
import {
	CreateTrackSensitiveDto,
	QueryGetListTrackSensitiveDto,
	UpdateTrackSensitiveDto,
} from '../dtos/track-sensitive.dto';
import { TrackSensitive } from '../entities/track-sensitive.entity';
import { TrackSensitiveQueryService } from './track-sensitive.query.service';

@Injectable()
export class TrackSensitiveService {
	constructor(
		@InjectRepository(TrackSensitive)
		private readonly trackSensitiveRepository: Repository<TrackSensitive>,
		private readonly trackSensitiveQueryService: TrackSensitiveQueryService,
	) {}

	async create(data: CreateTrackSensitiveDto, userId: string) {
		await this.trackSensitiveQueryService.validate({
			name: data.name,
			code: data.code,
		});

		const entity = this.trackSensitiveRepository.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return await this.trackSensitiveRepository.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.trackSensitiveRepository.findOne({
			where: { id },
		});
		if (!entity) throw new ResponseError(TrackSensitiveMessage.NOT_FOUND);
		return entity;
	}

	async getList(query: QueryGetListTrackSensitiveDto) {
		const { page, pageSize } = query;
		const [items, totalItems] =
			await this.trackSensitiveQueryService.getList(query);

		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.trackSensitiveRepository.find({
			select: ['id', 'code', 'name', 'icon'],
		});
	}

	async update(id: string, data: UpdateTrackSensitiveDto, userId: string) {
		const entity = await this.findOne(id);

		if (data.name && data.name !== entity.name) {
			await this.trackSensitiveQueryService.validate({ name: data.name });
		}
		if (data.code && data.code !== entity.code) {
			await this.trackSensitiveQueryService.validate({ code: data.code });
		}

		await this.trackSensitiveRepository.update(id, {
			...data,
			modifierId: userId,
		});

		return this.findOne(id);
	}

	async delete(id: string) {
		const entity =
			await this.trackSensitiveQueryService.findOneWithTrackCount(id);
		if ((entity?.trackCount ?? 0) > 0) {
			throw new ResponseError(
				TrackSensitiveMessage.CANNOT_DELETE_RELATION_WITH_TRACK,
			);
		}
		await this.trackSensitiveRepository.delete(id);
	}
}
