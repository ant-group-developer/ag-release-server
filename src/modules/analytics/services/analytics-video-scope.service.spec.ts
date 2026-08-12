import { globalValidationPipe } from 'src/common/config/validation.config';
import {
	AnalyticsSummaryQueryDto,
	ChartQueryDto,
	DspOverviewQueryDto,
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
	TimelineQueryDto,
} from '../dto/analytics-query.dto';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import {
	AnalyticsVideoScope,
	appendAnalyticsVideoScopeFilter,
} from './analytics-video-scope.service';

describe('appendAnalyticsVideoScopeFilter', () => {
	it('leaves analytics unrestricted for platform admins', () => {
		const params: Record<string, unknown> = {};
		expect(
			appendAnalyticsVideoScopeFilter('AND t.is_deleted = 0', params),
		).toBe('AND t.is_deleted = 0');
		expect(params).toEqual({});
	});

	it('keeps audio rows and scopes video rows to assigned channels', () => {
		const params: Record<string, unknown> = {};
		const scope: AnalyticsVideoScope = { allowedChannelIds: ['channel-a'] };

		expect(appendAnalyticsVideoScopeFilter('', params, scope)).toContain(
			"t.release_type != 'video' OR t.channel_id IN ({analyticsAllowedChannelIds:Array(String)})",
		);
		expect(params.analyticsAllowedChannelIds).toEqual(['channel-a']);
	});

	it.each([
		[TimelineQueryDto, { fromDate: '2026-01-01', toDate: '2026-01-31' }],
		[DspOverviewQueryDto, { fromDate: '2026-01-01', toDate: '2026-01-31' }],
		[ChartQueryDto, { fromDate: '2026-01-01', toDate: '2026-01-31' }],
		[
			EntityTimelineQueryDto,
			{ fromDate: '2026-01-01', toDate: '2026-01-31' },
		],
		[
			EntityOverviewQueryDto,
			{ fromDate: '2026-01-01', toDate: '2026-01-31' },
		],
		[
			AnalyticsSummaryQueryDto,
			{ fromDate: '2026-01-01', toDate: '2026-01-31' },
		],
		[AnalyticsReportExportDto, { fromDate: '2026-01', endDate: '2026-01' }],
	])(
		'preserves the server-injected scope after whitelist validation (%p)',
		async (metatype, payload) => {
			const analyticsVideoScope: AnalyticsVideoScope = {
				allowedChannelIds: ['channel-a'],
			};
			const result = await globalValidationPipe.transform(
				{ ...payload, analyticsVideoScope },
				{ type: 'body', metatype },
			);

			expect(
				(result as { analyticsVideoScope?: AnalyticsVideoScope })
					.analyticsVideoScope,
			).toEqual(analyticsVideoScope);
		},
	);
});
