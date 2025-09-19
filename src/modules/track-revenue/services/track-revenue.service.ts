import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { QueryGetListTrackRevenueDto } from '../dto/track-revenue.dto';
import { TrackRevenue } from '../entities/track-revenue.entity';

@Injectable()
export class TrackRevenueService {
	constructor(
		@InjectRepository(TrackRevenue)
		private readonly trackRevenueRepo: Repository<TrackRevenue>,
	) {}

	async getList(query: QueryGetListTrackRevenueDto) {
		const qb = this.createQueryGetList(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	private createBaseQuery() {
		return this.trackRevenueRepo
			.createQueryBuilder('trackRevenue')
			.leftJoinAndSelect('trackRevenue.track', 'track')
			.leftJoinAndSelect('track.release', 'release')
			.leftJoinAndSelect('trackRevenue.dsp', 'dsp');
	}

	private createQueryGetList(filter: QueryGetListTrackRevenueDto) {
		const qb = this.createBaseQuery();
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListTrackRevenueDto;
		qb: SelectQueryBuilder<TrackRevenue>;
	}) {
		const {
			keyword,
			startCreatedAt,
			endCreatedAt,
			dspId,
			releaseId,
			trackId,
			skip,
			pageSize,
			fieldOrder,
			orderBy,
		} = filter;

		if (keyword) {
			qb.andWhere(
				'(track.title ILIKE :keyword OR release.title ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(`trackRevenue.date BETWEEN :startDate AND :endDate`, {
				startCreatedAt,
				endCreatedAt,
			});
		}

		if (dspId) {
			qb.andWhere('dsp.id = :dspId', { dspId });
		}

		if (releaseId) {
			qb.andWhere('release.id = :releaseId', { releaseId });
		}

		if (trackId) {
			qb.andWhere('track.id = :trackId', { trackId });
		}

		qb.orderBy(fieldOrder ?? 'trackRevenue.date', orderBy ?? 'DESC');
		qb.skip(skip).take(pageSize);

		return qb;
	}
}
