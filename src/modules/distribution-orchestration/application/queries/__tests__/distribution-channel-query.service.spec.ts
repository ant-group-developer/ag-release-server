import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { DistributionChannelQueryService } from '../distribution-channel-query.service';

/**
 * Unit test DistributionChannelQueryService — mapping channel_delivery + tenant-scope.
 */
describe('DistributionChannelQueryService', () => {
	const DIST_ID = 'dist-1';
	const TENANT_ID = 'tenant-1';

	function makeService(opts: {
		channels: Array<Record<string, unknown>>;
		distTenantId?: string | null;
	}) {
		const channelRepo = {
			find: jest.fn().mockResolvedValue(opts.channels),
		};
		const distRepo = {
			findOne: jest
				.fn()
				.mockResolvedValue(
					opts.distTenantId === null
						? null
						: { id: DIST_ID, tenantId: opts.distTenantId ?? TENANT_ID },
				),
		};
		return new DistributionChannelQueryService(
			channelRepo as never,
			distRepo as never,
		);
	}

	it('map channel_delivery → view', async () => {
		const service = makeService({
			channels: [
				{
					channelId: 'dist-1:ch:1',
					dspCode: 'SPOTIFY',
					topology: 'DIRECT',
					state: 'LIVE',
					aggregatorCode: null,
					exportMethod: null,
					retryCount: 0,
					scheduledAt: null,
					ticketRef: null,
				},
				{
					channelId: 'dist-1:ch:2',
					dspCode: 'VEVO',
					topology: 'VIA_AGGREGATOR',
					state: 'ISSUES',
					aggregatorCode: 'CI',
					exportMethod: 'CI_DEAL',
					retryCount: 1,
					scheduledAt: null,
					ticketRef: 'TICKET-9',
				},
			],
		});

		const result = await service.listByDistribution(DIST_ID);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ dspCode: 'SPOTIFY', state: 'LIVE' });
		expect(result[1]).toMatchObject({
			dspCode: 'VEVO',
			state: 'ISSUES',
			ticketRef: 'TICKET-9',
		});
	});

	it('cluster CHƯA fan-out → expand members, mỗi DSP mang state cluster', async () => {
		const service = makeService({
			channels: [
				{
					channelId: 'dist-1:ch:0',
					dspCode: 'CI', // aggregator code — KHÔNG hiện như 1 DSP
					topology: 'VIA_AGGREGATOR',
					state: 'WAITING', // cả cụm đang chờ ingest
					aggregatorCode: 'CI',
					exportMethod: null,
					retryCount: 0,
					scheduledAt: null,
					ticketRef: null,
					isCluster: true,
					memberDspCodes: [
						{ dspCode: 'APPLE', exportMethod: 'STATE51' },
						{ dspCode: 'FACEBOOK', exportMethod: 'CI_DEAL' },
					],
				},
			],
		});

		const result = await service.listByDistribution(DIST_ID);

		// KHÔNG có row 'CI'; thay bằng 2 DSP con cùng state WAITING.
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.dspCode)).toEqual(['APPLE', 'FACEBOOK']);
		expect(result.every((r) => r.state === 'WAITING')).toBe(true);
		expect(result[0].exportMethod).toBe('STATE51');
	});

	it('cluster ĐÃ fan-out → dùng watcher rows (per-DSP), bỏ cluster row', async () => {
		const service = makeService({
			channels: [
				{
					channelId: 'dist-1:ch:0',
					dspCode: 'CI',
					topology: 'VIA_AGGREGATOR',
					state: 'SKIPPED',
					aggregatorCode: 'CI',
					exportMethod: null,
					retryCount: 0,
					scheduledAt: null,
					ticketRef: null,
					isCluster: true,
					memberDspCodes: [{ dspCode: 'APPLE' }, { dspCode: 'FACEBOOK' }],
				},
				{
					channelId: 'dist-1:ch:0:golive:APPLE',
					dspCode: 'APPLE',
					topology: 'VIA_AGGREGATOR',
					state: 'LIVE',
					aggregatorCode: 'CI',
					exportMethod: null,
					retryCount: 0,
					scheduledAt: null,
					ticketRef: null,
					isCluster: false,
					memberDspCodes: [],
				},
				{
					channelId: 'dist-1:ch:0:golive:FACEBOOK',
					dspCode: 'FACEBOOK',
					topology: 'VIA_AGGREGATOR',
					state: 'WAITING',
					aggregatorCode: 'CI',
					exportMethod: null,
					retryCount: 0,
					scheduledAt: null,
					ticketRef: null,
					isCluster: false,
					memberDspCodes: [],
				},
			],
		});

		const result = await service.listByDistribution(DIST_ID);

		// cluster row (SKIPPED, dspCode=CI) bị bỏ; chỉ còn 2 watcher với state go-live riêng.
		expect(result).toHaveLength(2);
		expect(result.map((r) => r.dspCode)).toEqual(['APPLE', 'FACEBOOK']);
		expect(result.map((r) => r.state)).toEqual(['LIVE', 'WAITING']);
	});

	it('distribution không tồn tại → NotFound', async () => {
		const service = makeService({ channels: [], distTenantId: null });
		await expect(service.listByDistribution(DIST_ID)).rejects.toThrow(
			NotFoundException,
		);
	});

	it('tenant out of scope → Forbidden', async () => {
		const service = makeService({ channels: [], distTenantId: TENANT_ID });
		await expect(
			service.listByDistribution(DIST_ID, ['other']),
		).rejects.toThrow(ForbiddenException);
	});

	it('admin (allowedTenantIds undefined) → bỏ qua scope', async () => {
		const service = makeService({ channels: [], distTenantId: TENANT_ID });
		await expect(
			service.listByDistribution(DIST_ID, undefined),
		).resolves.toEqual([]);
	});
});
