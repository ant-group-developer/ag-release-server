import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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
import { Between, Repository, SelectQueryBuilder } from 'typeorm';
import {
	BaseQueryStatisticsDto,
	QueryGetIssueCountDto,
	QueryGetOverviewCountDto,
	QueryGetStreamCountByCountryDto,
} from '../dto/statistics.dto';

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
		const [releasesCount, tracksCount, labelsCount, artistsCount] =
			await Promise.all([
				this.getReleasesCount(filter),
				this.getTracksCount(filter),
				this.getLabelsCount(filter),
				this.getArtistsCount(filter),
			]);

		return {
			releasesCount,
			tracksCount,
			labelsCount,
			artistsCount,
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

	async getTracksCount(filter: BaseQueryStatisticsDto) {
		const { startDate, endDate } = filter;
		return await this.trackRepo.count({
			where: this.buildDateFilter({ startDate, endDate }),
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
		return startDate && endDate
			? { createdAt: Between(startDate, endDate) }
			: {};
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
