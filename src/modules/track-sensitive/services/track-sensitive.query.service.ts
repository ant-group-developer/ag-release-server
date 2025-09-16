import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackSensitiveMessage } from '../constants/track-sensitive.const';
import { QueryGetListTrackSensitiveDto } from '../dtos/track-sensitive.dto';
import { TrackSensitive } from '../entities/track-sensitive.entity';

@Injectable()
export class TrackSensitiveQueryService {
	constructor(
		@InjectRepository(TrackSensitive)
		private readonly trackSensitiveRepo: Repository<TrackSensitive>,
	) {}

	private createQueryGetList(query: QueryGetListTrackSensitiveDto) {
		const { keyword, skip, pageSize, fieldOrder, orderBy } = query;
		const qb = this.trackSensitiveRepo.createQueryBuilder('ts');

		if (keyword) {
			qb.andWhere('ts.name ILIKE :keyword', { keyword: `%${keyword}%` });
		}

		qb.orderBy(`ts.${fieldOrder}`, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}

	async getList(query: QueryGetListTrackSensitiveDto) {
		return await this.createQueryGetList(query).getManyAndCount();
	}

	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const exist = await this.trackSensitiveRepo.findOne({
				where: { name },
			});
			if (exist)
				throw new ResponseError(TrackSensitiveMessage.DUPLICATE_NAME);
		}
		if (code) {
			const exist = await this.trackSensitiveRepo.findOne({
				where: { code },
			});
			if (exist)
				throw new ResponseError(TrackSensitiveMessage.DUPLICATE_CODE);
		}
	}

	async findOneWithTrackCount(id: string) {
		return this.trackSensitiveRepo
			.createQueryBuilder('ts')
			.leftJoin('ts.tracks', 'track')
			.where('ts.id = :id', { id })
			.loadRelationCountAndMap('ts.trackCount', 'ts.tracks')
			.getOne();
	}
}
