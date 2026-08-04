import {
	appendAnalyticsVideoScopeFilter,
	AnalyticsVideoScope,
} from './analytics-video-scope.service';

describe('appendAnalyticsVideoScopeFilter', () => {
	it('leaves analytics unrestricted for platform admins', () => {
		const params: Record<string, unknown> = {};
		expect(appendAnalyticsVideoScopeFilter('AND t.is_deleted = 0', params)).toBe(
			'AND t.is_deleted = 0',
		);
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
});
