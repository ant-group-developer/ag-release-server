import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { QueryGetListResultScan } from '../../dtos/copryright.dto';
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

	async getResultOfTrack(id: string) {
		return await this.trackScanHistoryRepo.find({
			where: { trackId: id },
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
