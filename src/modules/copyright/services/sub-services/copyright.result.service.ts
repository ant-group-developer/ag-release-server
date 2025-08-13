import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Raw, Repository } from 'typeorm';
import { QueryGetListResultScan } from '../../dtos/copyright.dto';
import { TrackScanHistory } from '../../entities/track-scan-history.entity';
import { ICreateResultScan } from '../../interface/copyright.interface';

@Injectable()
export class CopyrightResultService {
	constructor(
		@InjectRepository(TrackScanHistory)
		private readonly trackScanHistoryRepo: Repository<TrackScanHistory>,
	) {}

	async create(data: ICreateResultScan) {
		const trackScanHistory = this.trackScanHistoryRepo.create(data);

		return await this.trackScanHistoryRepo.save(trackScanHistory);
	}

	async getOneResult(id: string) {
		const result = await this.trackScanHistoryRepo.find({ where: { id } });

		if (!result) {
			throw new ResponseError({ message: 'Result not found' });
		}

		return result;
	}

	async getResultOfTrack(trackId: string) {
		return await this.trackScanHistoryRepo.find({
			where: {
				trackId,
				result: Raw(
					(alias) =>
						`${alias} IS NOT NULL AND jsonb_array_length(${alias}) > 0`,
				),
			},
			order: { createdAt: 'DESC' },
		});
	}

	async getListResult(
		query: QueryGetListResultScan,
	): Promise<PageDto<TrackScanHistory>> {
		const { page, pageSize } = query;

		const queryGetList = this.createQueryGetListHistoryScan(query);

		const [items, totalItems] = await queryGetList.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	private createQueryGetListHistoryScan(query: QueryGetListResultScan) {
		const {
			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = query;

		const queryBuilder =
			this.trackScanHistoryRepo.createQueryBuilder('trackScanHistory');

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`trackScanHistory.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`trackScanHistory.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		queryBuilder.orderBy(`trackScanHistory.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
