import { ForbiddenException } from '@nestjs/common';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { validate } from 'class-validator';
import {
	AnalyticsRankingV2QueryDto,
	RankingQueryDto,
	TimelineQueryDto,
} from '../dto/analytics-query.dto';
import { AnalyticsCacheService } from './analytics-cache.service';
import { AnalyticsRankingV2Service } from './analytics-ranking-v2.service';
import { buildAnalyticsFactFilters } from '../utils/analytics-series-filter.util';

const dates = { fromDate: '2026-01-01', toDate: '2026-08-31' };

function page<T>(items: T[], total = items.length) {
	return new PageDto({
		items,
		metadata: { page: 1, pageSize: 20, totalItems: total },
	});
}

describe('AnalyticsRankingV2Service', () => {
	const ranking = {
		getTopTracks: jest.fn(),
		getTopReleases: jest.fn(),
		getTopReleasesVideo: jest.fn(),
		getTopArtists: jest.fn(),
		getTopLabels: jest.fn(),
		getTopTenants: jest.fn(),
		getTopChannels: jest.fn(),
		getTopDsps: jest.fn(),
		getTopSourceTypes: jest.fn(),
	};
	const timeline = {
		getRevenueTopTrack: jest.fn(),
		getRevenueTopRelease: jest.fn(),
		getRevenueTopReleaseVideo: jest.fn(),
		getRevenueTopArtist: jest.fn(),
		getRevenueTopLabel: jest.fn(),
		getRevenueTopTenant: jest.fn(),
		getRevenueTopChannel: jest.fn(),
		getRevenueTopDsp: jest.fn(),
		getRevenueTopSourceType: jest.fn(),
	};
	const cache = new AnalyticsCacheService();
	const service = new AnalyticsRankingV2Service(
		ranking as never,
		timeline as never,
		cache,
	);

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it.each([
		['track', 'getTopTracks'],
		['release', 'getTopReleases'],
		['releaseVideo', 'getTopReleasesVideo'],
		['artist', 'getTopArtists'],
		['label', 'getTopLabels'],
		['tenant', 'getTopTenants'],
		['channel', 'getTopChannels'],
		['dsp', 'getTopDsps'],
		['sourceType', 'getTopSourceTypes'],
	] as const)(
		'trendViews %s delegates to the existing ranking API',
		async (entityType, method) => {
			ranking[method].mockResolvedValue(
				page([
					{
						rank: 1,
						isrc: 'USABC2600001',
						title: 'Song',
						artistName: 'Artist',
						releaseId: 'rel-1',
						totalViews: 10,
						releaseId2: null,
						artistId: 'artist-1',
						artistName2: 'Artist',
						labelId: 'label-1',
						labelName: 'Label',
						tenantId: 'tenant-1',
						tenantName: 'ANT',
						channelId: 'channel-1',
						channelName: 'Channel',
						pgDspId: 'spotify',
						dspReportIds: ['spotify-us'],
						dspName: 'Spotify',
						sourceType: 'ftp',
						sourceTypeLabel: 'FTP',
						release: null,
					},
				]),
			);

			const dto = Object.assign(new AnalyticsRankingV2QueryDto(), {
				...dates,
				metric: 'trendViews',
				entityType,
				filters: {
					tenantIds: ['7c2358a0-1a38-4a10-b806-a1531ef71b0c'],
				},
			});
			const result = await service.getRanking(SYSTEM_TENANT_ID, dto);

			expect(ranking[method]).toHaveBeenCalledTimes(1);
			const legacy = ranking[method].mock.calls[0][1] as RankingQueryDto & {
				filters?: unknown;
				sortBy?: string;
			};
			expect(legacy).toBeInstanceOf(RankingQueryDto);
			expect(legacy.filters).toEqual(dto.filters);
			expect(legacy.sortBy).toBeUndefined();
			expect(result.metric).toBe('trendViews');
			expect(result.entityType).toBe(entityType);
			expect(result.items[0].metrics.trendViews).toBe(10);
			expect(result.items[0].metrics.usage).toBeNull();
			expect(result.items[0].metrics.revenueUsd).toBeNull();
			expect(result.pagination).toEqual({
				page: 1,
				pageSize: 20,
				total: 1,
			});
			expect(timeline.getRevenueTopTrack).not.toHaveBeenCalled();
		},
	);

	it('usage and revenueUsd read the same sales API and only change sort', async () => {
		const salesRow = {
			rank: 2,
			isrc: 'USABC2600001',
			title: 'Song',
			artistName: 'Artist',
			releaseId: 'rel-1',
			quantity: 50,
			revenueUsd: 12.5,
			revenueUsdExact: '12.500000',
		};
		timeline.getRevenueTopTrack.mockResolvedValue(page([salesRow], 8));
		const filters = {
			dspIds: [
				{ pgDspId: 'spotify', dspReportIds: ['spotify-us'] },
				{ pgDspId: 'apple', dspReportIds: ['apple-us'] },
			],
		};

		const usage = await service.getRanking(
			SYSTEM_TENANT_ID,
			Object.assign(new AnalyticsRankingV2QueryDto(), {
				...dates,
				metric: 'usage',
				entityType: 'track',
				filters,
			}),
		);
		const revenue = await service.getRanking(
			SYSTEM_TENANT_ID,
			Object.assign(new AnalyticsRankingV2QueryDto(), {
				...dates,
				metric: 'revenueUsd',
				entityType: 'track',
				filters,
			}),
		);

		const usageQuery = timeline.getRevenueTopTrack.mock
			.calls[0][1] as TimelineQueryDto & { sortBy?: string; filters?: unknown };
		const revenueQuery = timeline.getRevenueTopTrack.mock
			.calls[1][1] as TimelineQueryDto & { sortBy?: string };
		expect(usageQuery.sortBy).toBe('usage');
		expect(revenueQuery.sortBy).toBe('revenue');
		expect(usageQuery.filters).toEqual(filters);
		expect(usage.items[0].metrics).toEqual(revenue.items[0].metrics);
		expect(usage.items[0].metrics.usage).toBe(50);
		expect(usage.items[0].metrics.revenueUsdExact).toBe('12.500000');
		expect(usage.items[0].metrics.trendViews).toBeNull();
	});

	it('returns an empty page when the legacy ranking is empty', async () => {
		ranking.getTopArtists.mockResolvedValue(page([], 0));
		const result = await service.getRanking(
			SYSTEM_TENANT_ID,
			Object.assign(new AnalyticsRankingV2QueryDto(), {
				...dates,
				metric: 'trendViews',
				entityType: 'artist',
			}),
		);
		expect(result.items).toEqual([]);
		expect(result.pagination.total).toBe(0);
	});

	it('puts metric, entityType, filters and dates in the cache key', async () => {
		ranking.getTopLabels.mockResolvedValue(page([], 0));
		const cacheSpy = jest.spyOn(cache, 'buildKey');
		const dto = Object.assign(new AnalyticsRankingV2QueryDto(), {
			...dates,
			metric: 'trendViews',
			entityType: 'label',
			filters: { labelIds: ['LBL1'] },
		});
		await service.getRanking(SYSTEM_TENANT_ID, dto);
		await service.getRanking(SYSTEM_TENANT_ID, dto);
		expect(cacheSpy).toHaveBeenCalledWith(
			'rank:v2',
			SYSTEM_TENANT_ID,
			expect.objectContaining({
				metric: 'trendViews',
				entityType: 'label',
				fromDate: dates.fromDate,
				toDate: dates.toDate,
				filters: { labelIds: ['LBL1'] },
			}),
		);
		expect(ranking.getTopLabels).toHaveBeenCalledTimes(1);
	});
});

describe('ranking fact filters', () => {
	it('rejects a normal tenant filtering another workspace', () => {
		expect(() =>
			buildAnalyticsFactFilters(
				'tenant-a',
				{
					filters: {
						tenantIds: ['7c2358a0-1a38-4a10-b806-a1531ef71b0c'],
					},
				},
				'trend',
			),
		).toThrow(ForbiddenException);
	});

	it('prioritizes each pg DSP and falls back to raw report IDs', () => {
		const result = buildAnalyticsFactFilters(
			SYSTEM_TENANT_ID,
			{
				filters: {
					tenantIds: ['7c2358a0-1a38-4a10-b806-a1531ef71b0c'],
					dspIds: [
						{ pgDspId: 'spotify', dspReportIds: ['spotify-us'] },
						{ dspReportIds: ['apple-us'] },
					],
				},
			},
			'revenue',
			{ forceTrackJoin: true },
		);

		expect(result.filterSql).toContain(
			'IN ({tenantIds:Array(String)})',
		);
		expect(result.filterSql).toContain(
			's.dsp_id IN (',
		);
		expect(result.filterSql).toContain('pg_uuid = {dspPgId0:String}');
		expect(result.filterSql).toContain(' OR ');
		expect(result.filterSql).not.toContain(
			'pg_uuid = {dspPgId0:String} AND s.dsp_id IN ({dspReportIds1:Array(String)})',
		);
		expect(result.params).toEqual(
			expect.objectContaining({
				dspPgId0: 'spotify',
				dspReportIds1: ['apple-us'],
			}),
		);
	});

	it('filters channelIds without requiring release type video', () => {
		const result = buildAnalyticsFactFilters(
			SYSTEM_TENANT_ID,
			{ filters: { channelIds: ['73b0d0c3-f584-4b81-b935-53c20d75f5af'] } },
			'trend',
			{ forceTrackJoin: true },
		);
		expect(result.filterSql).toContain(
			't.channel_id IN ({channelIds:Array(String)})',
		);
		expect(result.filterSql).not.toContain("release_type = 'video'");
	});
});

describe('AnalyticsRankingV2QueryDto', () => {
	it('rejects an empty filter array and does not define sortBy', async () => {
		const dto = new AnalyticsRankingV2QueryDto();
		dto.fromDate = '2026-01-01';
		dto.toDate = '2026-08-31';
		dto.metric = 'usage';
		dto.entityType = 'track';
		dto.filters = { tenantIds: [] } as never;
		const errors = await validate(dto);
		expect(errors.some((error) => error.property === 'filters')).toBe(true);
		expect(dto).not.toHaveProperty('sortBy');
	});
});
