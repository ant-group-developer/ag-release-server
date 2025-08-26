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
		const result = await this.trackScanHistoryRepo.findOne({
			where: { id },
		});

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

	async deleteByTrackId(trackId: string) {
		await this.trackScanHistoryRepo.delete({ trackId });
	}

	// query
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

	// compare
	async compareResultOfTrack({
		scanHistoryId1,
		scanHistoryId2,
	}: {
		scanHistoryId1: string;
		scanHistoryId2: string;
	}) {
		const scanHistory1 = await this.getOneResult(scanHistoryId1);
		const scanHistory2 = await this.getOneResult(scanHistoryId2);

		const resultCompare = this.getResultCompare(
			scanHistory1.result,
			scanHistory2.result,
		);

		scanHistory1.result = [];
		scanHistory2.result = [];

		return {
			resultCompare,
			scanHistory1,
			scanHistory2,
		};
	}

	private getResultCompare(
		result1: TrackScanHistory['result'],
		result2: TrackScanHistory['result'],
	) {
		const allKeys = [
			...result1.map((r) => JSON.stringify(r.key)),
			...result2.map((r) => JSON.stringify(r.key)),
		];
		const uniqueKeys = Array.from(new Set(allKeys)).map((k) =>
			JSON.parse(k),
		);

		return uniqueKeys.map((key) => {
			const content1 =
				result1.find(
					(r) =>
						r.key.startSecond === key.startSecond &&
						r.key.endSecond === key.endSecond,
				)?.content ?? null;

			const content2 =
				result2.find(
					(r) =>
						r.key.startSecond === key.startSecond &&
						r.key.endSecond === key.endSecond,
				)?.content ?? null;

			return {
				key,
				content1,
				content2,
			};
		});
	}
}
