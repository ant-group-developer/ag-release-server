import {
	AnalyticsRankingEntityType,
	AnalyticsRankingMetric,
} from '../dto/analytics-query.dto';
import { SourceBreakdownItem } from './analytics.interface';

export interface AnalyticsRankingV2Entity {
	id: string;
	type: AnalyticsRankingEntityType;
	name: string;
	imageUrl: string | null;
	subtitle?: string | null;
	isrc?: string | null;
	releaseId?: string | null;
	upc?: string | null;
	pgDspId?: string | null;
	dspReportId?: string | null;
	tenantId?: string | null;
}

export interface AnalyticsRankingV2Metrics {
	trendViews: number | null;
	usage: number | null;
	revenueUsd: number | null;
	revenueUsdExact: string | null;
}

export interface AnalyticsRankingV2Item {
	rank: number;
	entity: AnalyticsRankingV2Entity;
	metrics: AnalyticsRankingV2Metrics;
	bySource: SourceBreakdownItem[];
}

export interface AnalyticsRankingV2Response {
	metric: AnalyticsRankingMetric;
	entityType: AnalyticsRankingEntityType;
	items: AnalyticsRankingV2Item[];
	pagination: {
		page: number;
		pageSize: number;
		total: number;
	};
}
