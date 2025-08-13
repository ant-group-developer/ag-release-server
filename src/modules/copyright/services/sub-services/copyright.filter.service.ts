import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/response.dto';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import {
	CreateTrackScanStatusDto,
	QueryGetListFilter,
} from '../../dtos/copyright.dto';
import { TrackScanStatus } from '../../entities/track-scan-status.entity';
import { ScanStatus } from '../../enums/copyright.enum';

export class CopyrightFilterService {
	constructor(
		@InjectRepository(TrackScanStatus)
		private readonly trackScanStatusRepo: Repository<TrackScanStatus>,
	) {}

	// filter
	async create(
		data: CreateTrackScanStatusDto,
		status: ScanStatus,
		trackIdsToScan: string[],
	): Promise<TrackScanStatus> {
		const newFilter = this.trackScanStatusRepo.create({
			...data,
			status,
			trackIdsToScan,
			trackNeedScanCount: trackIdsToScan.length,
		});

		const filterDb = await this.trackScanStatusRepo.save(newFilter);
		return filterDb;
	}

	async updateStatus(id: string, status: ScanStatus) {
		await this.trackScanStatusRepo.update(id, { status });
	}

	async updateTrackScannedCount(id: string, trackScannedCount: number) {
		await this.trackScanStatusRepo.update(id, { trackScannedCount });
	}

	// read
	async getDetailFilter(id: string) {
		const filter = await this.trackScanStatusRepo.findOne({
			where: { id },
		});

		if (!filter) {
			throw new ResponseError({ message: 'Filter not found' });
		}

		return filter;
	}

	async getListFilter(query: QueryGetListFilter) {
		const { page, pageSize } = query;
		const queryGetList = this.createQueryGetList(query);

		const [dataFromDb, totalItems]: [
			{
				entities: TrackScanStatus[];
				raw: {
					trackScanStatus_id: string;
					track_id: string;
					track_title: string;
				}[];
			},
			number,
		] = await Promise.all([
			queryGetList.getRawAndEntities(),
			queryGetList.getCount(),
		]);

		const trackScanStatus = this.assigneeVirtualColumn(dataFromDb);

		return new PageDto({
			items: trackScanStatus,
			metadata: {
				currentPage: page,
				pageSize,
				totalItems,
			},
		});
	}

	private assigneeVirtualColumn(dataFromDb: {
		entities: TrackScanStatus[];
		raw: {
			trackScanStatus_id: string;
			track_id: string;
			track_title: string;
		}[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRaw = dataFromDb.raw.filter(
				(item) => item.trackScanStatus_id === entity.id,
			);

			entity.tracksToScan = dataRaw.map((item) => ({
				id: item.track_id,
				title: item.track_title,
			}));

			return entity;
		});
	}

	private createQueryGetList(query: QueryGetListFilter) {
		const {
			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			status,

			fieldOrder,
			orderBy,
			skip,
			pageSize,
		} = query;

		const queryBuilder =
			this.trackScanStatusRepo.createQueryBuilder('trackScanStatus');

		queryBuilder
			.leftJoin('trackScanStatus.creator', 'creator')
			.leftJoin('trackScanStatus.modifier', 'modifier')
			.leftJoin(
				Track,
				'track',
				'track.id = ANY(trackScanStatus.trackIdsToScan)',
			);

		queryBuilder.addSelect([
			'creator.name',
			'creator.avatar',

			'modifier.name',
			'modifier.avatar',

			'track.id as track_id',
			'track.title as track_title',
		]);

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`trackScanStatus.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{ startCreatedAt, endCreatedAt },
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`trackScanStatus.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{ startUpdatedAt, endUpdatedAt },
			);
		}

		if (status) {
			queryBuilder.andWhere(`trackScanStatus.status = :status`, {
				status,
			});
		}

		queryBuilder.orderBy(`trackScanStatus.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
