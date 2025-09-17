import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackOriginTypeMessages } from '../constants/track-origin-type.constant';
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

	// create
	async create(
		data: CreateTrackOriginTypeDto,
		userId: string,
	): Promise<TrackOriginType> {
		const { name, code } = data;

		await this.trackOriginTypeQueryService.validate({ name, code });

		const trackOriginType = this.trackOriginTypeRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		const result = await this.trackOriginTypeRepo.save(trackOriginType);

		if (result.isDefault) {
			await this.setDefault(result.id);
		}

		return result;
	}

	// read
	async findOne(id: string): Promise<TrackOriginType> {
		const trackOriginType = await this.trackOriginTypeRepo.findOne({
			where: { id },
		});
		if (!trackOriginType) {
			throw new ResponseError(TrackOriginTypeMessages.NOT_FOUND);
		}

		return trackOriginType;
	}

	async findOneWithCountRelation(id: string): Promise<TrackOriginType> {
		const trackOriginType =
			await this.trackOriginTypeQueryService.findOneWithCountRelation(id);

		if (!trackOriginType) {
			throw new ResponseError(TrackOriginTypeMessages.NOT_FOUND);
		}

		return trackOriginType;
	}

	async getListSimple() {
		return await this.trackOriginTypeRepo.find({
			select: ['id', 'code', 'name'],
		});
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

	// update
	async update(
		id: string,
		data: UpdateTrackOriginTypeDto,
		userId: string,
	): Promise<TrackOriginType> {
		const { name, code, isDefault } = data;
		const trackOriginType = await this.findOne(id);

		if (name && name !== trackOriginType.name) {
			await this.trackOriginTypeQueryService.validate({ name });
		}

		if (code && code !== trackOriginType.code) {
			await this.trackOriginTypeQueryService.validate({ code });
		}

		if (isDefault && isDefault !== trackOriginType.isDefault) {
			await this.setDefault(trackOriginType.id);
		}

		await this.trackOriginTypeRepo.update(id, {
			...data,
			modifierId: userId,
		});
		return await this.findOne(id);
	}

	// delete
	async delete(id: string): Promise<void> {
		const trackOriginType = await this.findOneWithCountRelation(id);
		this.trackOriginTypeQueryService.validateDelete(trackOriginType);
		await this.trackOriginTypeRepo.delete(id);
	}

	async setDefault(id: string) {
		await this.trackOriginTypeRepo
			.createQueryBuilder()
			.update()
			.set({ isDefault: false })
			.where('isDefault = :isDefault', { isDefault: true })
			.execute();
		await this.trackOriginTypeRepo.update({ id }, { isDefault: true });
	}
}
