import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { QueryGetListTrackRevenueDto } from '../dto/track-revenue.dto';
import { TrackRevenue } from '../entities/track-revenue.entity';

@Injectable()
export class TrackRevenueService {
	constructor(
		@InjectRepository(TrackRevenue)
		private readonly trackRevenueRepo: Repository<TrackRevenue>,
	) {}

	async getList(query: QueryGetListTrackRevenueDto) {
		const { page, pageSize } = query;
		const qb = this.createQueryGetList(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: { pageSize, totalItems, page: page },
		});
	}

	// query service
	private createBaseQuery() {
		return this.trackRevenueRepo.createQueryBuilder('trackRevenue');
	}

	private createQueryGetList(filter: QueryGetListTrackRevenueDto) {
		const qb = this.createBaseQuery();
		this.leftJoinRelations(qb);

		this.applyFilter({ qb, filter });

		this.selectTrackRevenue(qb);
		this.addSelectDsp(qb);
		this.addSelectTrack(qb);
		this.addSelectRelease(qb);
		this.addSelectLabel(qb);
		this.addSelectTenant(qb);
		this.addSelectTrackArtist(qb);
		this.addSelectPrimaryGenre(qb);

		return qb;
	}

	private leftJoinRelations(qb: SelectQueryBuilder<TrackRevenue>) {
		this.leftJoinTrack(qb);
		this.leftJoinTrackArtist(qb);
		this.leftJoinRelease(qb);
		this.leftJoinLabel(qb);
		this.leftJoinTenant(qb);
		this.leftJoinDsp(qb);
		this.leftJoinTrackPrimaryGenre(qb);

		return qb;
	}

	private leftJoinTrack(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('trackRevenue.track', 'track');
	}

	private leftJoinRelease(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('track.release', 'release');
	}

	private leftJoinLabel(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('release.label', 'label');
	}

	private leftJoinTenant(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('release.tenant', 'tenant');
	}

	private leftJoinDsp(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('trackRevenue.dsp', 'dsp');
	}

	private leftJoinTrackArtist(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb
			.leftJoin('track.trackArtists', 'trackArtist')
			.leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist');
	}

	private leftJoinTrackPrimaryGenre(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.leftJoin('track.primaryGenre', 'primaryGenre');
	}

	private selectTrackRevenue(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.select([
			'trackRevenue.id',
			'trackRevenue.reportDate',
			'trackRevenue.dspId',
			'trackRevenue.countryCode',
			'trackRevenue.currencyCode',
			'trackRevenue.amount',
			'trackRevenue.configuration',
			'trackRevenue.trackId',
		]);
	}

	private addSelectDsp(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect(['dsp.id', 'dsp.name', 'dsp.picture']);
	}

	private addSelectTrack(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect([
			'track.id',
			'track.title',
			'track.isrc',
			'track.releaseId',
			'track.primaryGenreId',
		]);
	}

	private addSelectRelease(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect(['release.id', 'release.title', 'release.labelId']);
	}

	private addSelectLabel(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect([
			'label.id',
			'label.name',
			'label.picture',
			'label.tenantId',
		]);
	}

	private addSelectTenant(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect(['tenant.id', 'tenant.name']);
	}

	private addSelectTrackArtist(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb
			.addSelect([
				'trackArtist.id',
				'trackArtist.artistId',
				'trackArtist.artistRoleId',
			])
			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
			.addSelect(['artist.id', 'artist.name', 'artist.picture']);
	}

	private addSelectPrimaryGenre(qb: SelectQueryBuilder<TrackRevenue>) {
		return qb.addSelect([
			'primaryGenre.id',
			'primaryGenre.name',
			'primaryGenre.picture',
		]);
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListTrackRevenueDto;
		qb: SelectQueryBuilder<TrackRevenue>;
	}) {
		const {
			startReportDate,
			endReportDate,

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
				new Brackets((qb) => {
					qb.where('track.title ILIKE :keyword')
						.orWhere('release.title ILIKE :keyword')
						.orWhere('label.name ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
		}

		if (startReportDate && endReportDate) {
			qb.andWhere(
				`trackRevenue.reportDate BETWEEN :startReportDate AND :endReportDate`,
				{
					startReportDate,
					endReportDate,
				},
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`trackRevenue.createAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (dspId?.length) {
			qb.andWhere('trackRevenue.dspId IN (:...dspId)', {
				dspId,
			});
		}

		if (releaseId?.length) {
			qb.andWhere('track.releaseId IN (:...releaseId)', {
				releaseId,
			});
		}

		if (trackId?.length) {
			qb.andWhere('trackRevenue.trackId IN (:...trackId)', {
				trackId,
			});
		}

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}
}
