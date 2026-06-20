import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { AllOrSimple } from 'src/modules/orm/enum/orm.enum';
import {
	IssueFields,
	IssueSimpleFields,
} from 'src/modules/orm/filed-mappings/orm.issue.constant';
import { TenantIssueFields } from 'src/modules/orm/filed-mappings/orm.tenant-issue.constant';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackRevenue } from 'src/modules/track-revenue/entities/track-revenue.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Between, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
	BaseQueryStatisticsDto,
	QueryGetIssueCountDto,
	QueryGetOverviewCountDto,
	QueryGetStreamCountByCountryDto,
} from '../dto/statistics.dto';
import {
	IRevenueDspDetail,
	IRevenueDspTimeline,
} from '../statistics.interface';
import { getGroupByFormatAndDateList } from '../statistics.util';

@Injectable()
export class StatisticsService {
	private readonly releaseAlias = 'release';
	private readonly trackAlias = 'track';
	private readonly labelAlias = 'label';
	private readonly artistAlias = 'artist';
	private readonly issueAlias = 'issue';
	private readonly tenantIssueAlias = 'tenantIssue';
	private readonly trackRevenueAlias = 'trackRevenue';

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
		@InjectRepository(Artist)
		private readonly artistsRepo: Repository<Artist>,
		@InjectRepository(Issue)
		private readonly issueRepo: Repository<Issue>,
		@InjectRepository(TrackRevenue)
		private readonly trackRevenueRepo: Repository<TrackRevenue>,

		@InjectDataSource() private dataSource: DataSource,
	) {}

	async getIssueCounts(filter: QueryGetIssueCountDto) {
		const qb = this.createBaseQbIssue();
		this.leftJoinIssueWithTenantIssue(qb);
		this.selectIssue({
			qb,
			select: [IssueFields.ID, IssueFields.NAME_EN],
		});
		qb.addSelect(`COUNT(${TenantIssueFields.ID})`, 'total');
		qb.groupBy(IssueFields.ID);

		this.andWhereTenantIssueCreatedAt({ qb, ...filter });

		const raw = await qb.getRawMany<{
			issue_id: string;
			issue_name_en: string;
			total: string;
		}>();

		return raw.map((r) => ({
			id: r.issue_id,
			nameEn: r.issue_name_en,
			total: Number(r.total),
		}));
	}

	async getOverviewCounts(filter: QueryGetOverviewCountDto) {
		const [
			releasesCount,
			tracksCount,
			labelsCount,
			artistsCount,
			releasesImportCount,
			tracksImportCount,
		] = await Promise.all([
			this.getReleasesCount(filter),
			this.getTracksCount(filter),
			this.getLabelsCount(filter),
			this.getArtistsCount(filter),
			this.getReleasesImportCount(filter),
			this.getTracksImportCount(filter),
		]);

		return {
			releasesCount,
			tracksCount,
			labelsCount,
			artistsCount,
			releasesImportCount,
			tracksImportCount,
		};
	}

	async getStreamCountsByCountry(filter: QueryGetStreamCountByCountryDto) {
		return this.trackRevenueRepo
			.createQueryBuilder('trackRevenue')
			.select('trackRevenue.countryCode', 'countryCode')
			.addSelect('COUNT(trackRevenue.id)', 'total')
			.groupBy('trackRevenue.countryCode')
			.getRawMany();
	}

	async getReleasesCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;

		return await this.releaseRepo.count({
			where: this.buildDateFilter({ startDate, endDate }),
		});
	}

	async getReleasesImportCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.releaseRepo.count({
			where: {
				...this.buildDateFilter({ startDate, endDate }),
				isImportedFromReport: true,
			},
		});
	}

	async getTracksCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.trackRepo.count({
			where: this.buildDateFilter({ startDate, endDate }),
		});
	}

	async getTracksImportCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.trackRepo.count({
			where: {
				...this.buildDateFilter({ startDate, endDate }),
				isImportedFromReport: true,
			},
		});
	}

	async getLabelsCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.labelRepo.count({
			where: this.buildDateFilter({ startDate, endDate }),
		});
	}

	async getArtistsCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.artistsRepo.count({
			where: this.buildDateFilter({ startDate, endDate }),
		});
	}

	async getRevenueDspTimeline(
		filter: QueryGetStreamCountByCountryDto,
	): Promise<IRevenueDspTimeline[]> {
		const { startDate, endDate, typeGroup } = filter;
		if (!startDate || !endDate)
			throw new ResponseError({
				message: 'startDate and endDate is required.',
			});

		const { dateList, dayjsFormat } = getGroupByFormatAndDateList({
			startDate,
			endDate,
			typeDateTimeline: typeGroup,
		});

		const formatMap = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' };
		const dateFormat = formatMap[typeGroup] || 'YYYY-MM';

		const detailData = await this.trackRevenueRepo
			.createQueryBuilder('tr')
			.leftJoin('tr.dsp', 'dsp')
			.select(`TO_CHAR(tr.reportDate, '${dateFormat}')`, 'date')
			.addSelect('tr.dspId', 'dsp_id')
			.addSelect('dsp.name', 'dsp_name')
			.addSelect('SUM(tr.amount)', 'total_revenue')
			.addSelect('COUNT(DISTINCT tr.id)', 'total_records')
			.where('tr.reportDate BETWEEN :startDate AND :endDate', {
				startDate,
				endDate,
			})
			.groupBy('date')
			.addGroupBy('tr.dspId')
			.addGroupBy('dsp.name')
			.orderBy('date', 'ASC')
			.getRawMany<{
				date: string;
				dsp_id: string;
				dsp_name: string;
				total_revenue: string;
				total_records: string;
			}>();

		const resultMap = new Map<
			string,
			{ total_revenue: number; total_records: number }
		>();
		const detailMap = new Map<string, IRevenueDspDetail[]>();

		for (const d of detailData) {
			const key = d.date;
			if (!detailMap.has(key)) detailMap.set(key, []);
			detailMap.get(key)!.push({
				dspId: d.dsp_id,
				dspName: d.dsp_name || '',
				totalRevenue: parseFloat(d.total_revenue) || 0,
				totalRecords: parseInt(d.total_records) || 0,
			});
			const total = resultMap.get(key) || {
				total_revenue: 0,
				total_records: 0,
			};
			total.total_revenue += parseFloat(d.total_revenue) || 0;
			total.total_records += parseInt(d.total_records) || 0;
			resultMap.set(key, total);
		}

		return dateList.map((d) => {
			const key = dayjs(d, dayjsFormat).format(dateFormat);
			return {
				date: dayjs(d, dayjsFormat).toISOString(),
				totalRevenue: resultMap.get(key)?.total_revenue || 0,
				totalRecords: resultMap.get(key)?.total_records || 0,
				detail: detailMap.get(key) || [],
			};
		});
	}

	// private
	private applyFilterStream({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<Release | Issue | Label | Artist | TrackRevenue>;
		filter:
			| QueryGetIssueCountDto
			| QueryGetOverviewCountDto
			| QueryGetStreamCountByCountryDto;
	}) {
		const { startDate, endDate } = filter;
		const alias = qb.alias;

		if (startDate && endDate) {
			qb.andWhere(`${alias}.createdAt BETWEEN :startDate AND :endDate`, {
				startDate,
				endDate,
			});
		}

		return qb;
	}

	private buildDateFilter({
		startDate,
		endDate,
	}: {
		startDate: Date;
		endDate: Date;
	}) {
		if (!startDate || !endDate) return {};

		const { startOfDay, endOfDay } = this.normalizeDateRangeToFullDays({
			startDate,
			endDate,
		});
		return { createdAt: Between(startOfDay, endOfDay) };
	}

	private normalizeDateRangeToFullDays({
		startDate,
		endDate,
	}: {
		startDate: Date;
		endDate: Date;
	}) {
		return {
			startOfDay: dayjs(startDate).startOf('day').toDate(),
			endOfDay: dayjs(endDate).endOf('day').toDate(),
		};
	}

	// private method --version 2
	// createBaseQb_Entity
	// leftJoin_EntityA_With_EntityB
	// addSelect_Entity
	// andWhereEntity_FieldOfEntity

	// createBaseQb_Entity
	private createBaseQbIssue() {
		return this.issueRepo.createQueryBuilder(this.issueAlias);
	}

	// leftJoin_EntityA_With_EntityB
	private leftJoinIssueWithTenantIssue(qb: SelectQueryBuilder<Issue>) {
		qb.leftJoin(`${this.issueAlias}.tenantIssues`, this.tenantIssueAlias);
	}

	// andWhereEntity_FieldOfEntity
	private andWhereTenantIssueCreatedAt({
		qb,
		startDate,
		endDate,
	}: {
		qb: SelectQueryBuilder<Issue>;
		startDate: QueryGetIssueCountDto['startDate'];
		endDate: QueryGetIssueCountDto['endDate'];
	}) {
		if (startDate && endDate) {
			qb.andWhere(
				`${this.tenantIssueAlias}.createdAt BETWEEN :startDate AND :endDate`,
				{
					startDate,
					endDate,
				},
			);
		}
	}

	andWhereReleaseCreatedAt({
		qb,
		startDate,
		endDate,
	}: {
		qb: SelectQueryBuilder<Issue>;
		startDate: QueryGetIssueCountDto['startDate'];
		endDate: QueryGetIssueCountDto['endDate'];
	}) {
		if (startDate && endDate) {
			qb.andWhere(
				`${this.releaseAlias}.createdAt BETWEEN :startDate AND :endDate`,
				{
					startDate,
					endDate,
				},
			);
		}
	}

	// addSelect_Entity
	private selectIssue({
		qb,
		select,
	}: {
		qb: SelectQueryBuilder<Issue>;
		select: AllOrSimple.ALL | AllOrSimple.SIMPLE | string[];
	}) {
		if (select === AllOrSimple.ALL) {
			qb.select(Object.values(IssueFields));
		} else if (select === AllOrSimple.SIMPLE) {
			qb.select(Object.values(IssueSimpleFields));
		} else if (select?.length) {
			qb.select(select);
		}
	}
}
