import { Injectable } from '@nestjs/common';
import { PageDto } from 'src/common/dtos/common.response.dto';
import {
	AnalyticsFilterSetDto,
	AnalyticsRankingEntityType,
	AnalyticsRankingMetric,
	AnalyticsRankingV2QueryDto,
	RankingQueryDto,
	TimelineQueryDto,
} from '../dto/analytics-query.dto';
import { AnalyticsRankingV2Response } from '../interfaces/analytics-ranking-v2.interface';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
	mapSalesRankingItem,
	mapTrendRankingItem,
} from './analytics-ranking-v2.mapper';
import { TimelineAnalyticsService } from './global-timeline.service';
import { RankingService } from './ranking.service';

type LegacyRankingQuery = RankingQueryDto & {
	filters?: AnalyticsFilterSetDto;
};
type LegacyRevenueQuery = TimelineQueryDto & {
	filters?: AnalyticsFilterSetDto;
	sortBy?: 'revenue' | 'usage';
};

@Injectable()
export class AnalyticsRankingV2Service {
	constructor(
		private readonly rankingService: RankingService,
		private readonly timelineService: TimelineAnalyticsService,
		private readonly cache: AnalyticsCacheService,
	) {}

	async getRanking(
		tenantId: string,
		dto: AnalyticsRankingV2QueryDto,
	): Promise<AnalyticsRankingV2Response> {
		const key = this.cache.buildKey('rank:v2', tenantId, {
			metric: dto.metric,
			entityType: dto.entityType,
			fromDate: dto.fromDate,
			toDate: dto.toDate,
			page: dto.page ?? 1,
			pageSize: dto.pageSize ?? 20,
			keyword: dto.keyword ?? null,
			releaseType: dto.releaseType ?? null,
			groupBySource: dto.groupBySource ?? false,
			filters: dto.filters ?? {},
		});
		return this.cache.wrap(key, () => this.compute(tenantId, dto));
	}

	private async compute(
		tenantId: string,
		dto: AnalyticsRankingV2QueryDto,
	): Promise<AnalyticsRankingV2Response> {
		if (dto.metric === 'trendViews') {
			const page = await this.loadTrend(tenantId, dto);
			return this.toResponse(dto, page, (row) =>
				mapTrendRankingItem(dto.entityType, row as never),
			);
		}
		const page = await this.loadSales(tenantId, dto);
		return this.toResponse(dto, page, (row) =>
			mapSalesRankingItem(dto.entityType, row as never),
		);
	}

	private toResponse(
		dto: AnalyticsRankingV2QueryDto,
		page: PageDto<any>,
		mapRow: (row: any) => AnalyticsRankingV2Response['items'][number],
	): AnalyticsRankingV2Response {
		return {
			metric: dto.metric,
			entityType: dto.entityType,
			items: page.items.map((row) => mapRow(row)),
			pagination: {
				page: page.metadata.page,
				pageSize: page.metadata.pageSize,
				total: page.metadata.totalItems,
			},
		};
	}

	private async loadTrend(
		tenantId: string,
		dto: AnalyticsRankingV2QueryDto,
	): Promise<PageDto<any>> {
		const query = this.trendQuery(dto);
		const loaders: Record<
			AnalyticsRankingEntityType,
			() => Promise<PageDto<any>>
		> = {
			track: () => this.rankingService.getTopTracks(tenantId, query),
			release: () => this.rankingService.getTopReleases(tenantId, query),
			releaseVideo: () =>
				this.rankingService.getTopReleasesVideo(tenantId, query),
			artist: () => this.rankingService.getTopArtists(tenantId, query),
			label: () => this.rankingService.getTopLabels(tenantId, query),
			tenant: () => this.rankingService.getTopTenants(tenantId, query),
			channel: () => this.rankingService.getTopChannels(tenantId, query),
			dsp: () => this.rankingService.getTopDsps(tenantId, query),
			sourceType: () =>
				this.rankingService.getTopSourceTypes(tenantId, query),
		};
		return loaders[dto.entityType]();
	}

	private async loadSales(
		tenantId: string,
		dto: AnalyticsRankingV2QueryDto,
	): Promise<PageDto<any>> {
		const query = this.salesQuery(dto);
		const loaders: Record<
			AnalyticsRankingEntityType,
			() => Promise<PageDto<any>>
		> = {
			track: () => this.timelineService.getRevenueTopTrack(tenantId, query),
			release: () =>
				this.timelineService.getRevenueTopRelease(tenantId, query),
			releaseVideo: () =>
				this.timelineService.getRevenueTopReleaseVideo(tenantId, query),
			artist: () =>
				this.timelineService.getRevenueTopArtist(tenantId, query),
			label: () => this.timelineService.getRevenueTopLabel(tenantId, query),
			tenant: () =>
				this.timelineService.getRevenueTopTenant(tenantId, query),
			channel: () =>
				this.timelineService.getRevenueTopChannel(tenantId, query),
			dsp: () => this.timelineService.getRevenueTopDsp(tenantId, query),
			sourceType: () =>
				this.timelineService.getRevenueTopSourceType(tenantId, query),
		};
		return loaders[dto.entityType]();
	}

	private trendQuery(dto: AnalyticsRankingV2QueryDto): LegacyRankingQuery {
		const query = Object.assign(new RankingQueryDto(), {
			fromDate: dto.fromDate,
			toDate: dto.toDate,
			page: dto.page ?? 1,
			pageSize: dto.pageSize ?? 20,
			keyword: dto.keyword,
			releaseType: dto.releaseType,
			groupBySource: dto.groupBySource ?? false,
			analyticsVideoScope: dto.analyticsVideoScope,
		}) as LegacyRankingQuery;
		query.filters = dto.filters ?? {};
		return query;
	}

	private salesQuery(dto: AnalyticsRankingV2QueryDto): LegacyRevenueQuery {
		const query = Object.assign(new TimelineQueryDto(), {
			fromDate: dto.fromDate,
			toDate: dto.toDate,
			page: dto.page ?? 1,
			pageSize: dto.pageSize ?? 20,
			keyword: dto.keyword,
			releaseType: dto.releaseType,
			groupBySource: dto.groupBySource ?? false,
			analyticsVideoScope: dto.analyticsVideoScope,
			sortBy: this.sortForMetric(dto.metric),
		}) as LegacyRevenueQuery;
		query.filters = dto.filters ?? {};
		return query;
	}

	private sortForMetric(
		metric: AnalyticsRankingMetric,
	): 'revenue' | 'usage' {
		return metric === 'usage' ? 'usage' : 'revenue';
	}
}
