import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Label } from 'src/modules/label/entities/label.entity';
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
		const { endDate, startDate } = filter;

		const qb = this.issueRepo
			.createQueryBuilder('issue')
			.leftJoin(
				'issue.tenantIssues',
				'tenantIssue',
				startDate && endDate
					? 'tenantIssue.createdAt BETWEEN :startDate AND :endDate'
					: undefined,
				startDate && endDate ? { startDate, endDate } : {},
			)
			.select(['issue.id', 'issue.nameEn'])
			.addSelect('COUNT(tenantIssue.id)', 'total')
			.groupBy('issue.id');

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
}
