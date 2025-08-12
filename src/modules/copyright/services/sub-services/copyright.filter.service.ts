import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTrackScanStatusDto, QueryGetListFilter } from '../../dtos/copryright.dto';
import { TrackScanStatus } from '../../entities/track-scan-status.entity';
import { ScanStatus } from '../../enums/copyright.enum';
import { PageDto } from 'src/common/dtos/response.dto';

export class CopyrightFilterService {
	constructor(
		@InjectRepository(TrackScanStatus)
		private readonly trackScanStatusRepo: Repository<TrackScanStatus>,
	) { }

	// filter
	async create(data: CreateTrackScanStatusDto): Promise<TrackScanStatus> {
		const newFilter = this.trackScanStatusRepo.create({
			...data,
			status: ScanStatus.PENDING,
		});

		const filterDb = await this.trackScanStatusRepo.save(newFilter);
		return filterDb;
	}

	async updateStatus(filter: TrackScanStatus, status: ScanStatus) {
		filter.status = status;
		await this.trackScanStatusRepo.save(filter);
	}

	// read
	async getListFilter(query: QueryGetListFilter) {
		const { page, pageSize } = query;

		const queryGetList = this.createQueryGetList(query);

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

	private createQueryGetList(query: QueryGetListFilter) {
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
			this.trackScanStatusRepo.createQueryBuilder('trackScanStatus');

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

		queryBuilder.orderBy(`trackScanStatus.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
