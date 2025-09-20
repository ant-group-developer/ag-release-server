import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Artist } from 'src/modules/artist/entities/artist.entity';
import { Issue } from 'src/modules/issue/entities/issue.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackRevenue } from 'src/modules/track-revenue/entities/track-revenue.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import {
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
			.leftJoin('issue.tenantIssues', 'tenantIssue')
			.select(['issue.id', 'issue.nameEn'])
			.addSelect('COUNT(tenantIssue.id)', 'total')
			.groupBy('issue.id');

		// if (startDate && endDate) {
		// 	qb.andWhere('')
		// }

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
				this.getReleasesCount(),
				this.getTracksCount(),
				this.getLabelsCount(),
				this.getArtistsCount(),
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

	async getReleasesCount() {
		return await this.releaseRepo.count();
	}

	async getTracksCount() {
		return await this.trackRepo.count();
	}

	async getLabelsCount() {
		return await this.labelRepo.count();
	}

	async getArtistsCount() {
		return await this.artistsRepo.count();
	}
}
