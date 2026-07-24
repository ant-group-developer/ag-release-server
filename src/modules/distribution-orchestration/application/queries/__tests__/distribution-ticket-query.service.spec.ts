import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { OrchestrationTicketOrmEntity } from '../../../infrastructure/persistence/orchestration-ticket.orm-entity';
import { DistributionTicketQueryService } from '../distribution-ticket-query.service';

/**
 * Unit test DistributionTicketQueryService — mapping metadata→items[] + tenant-scope guard.
 * Repo TypeORM mock tối thiểu (find + distRepo.findOne).
 */
describe('DistributionTicketQueryService', () => {
	const DIST_ID = 'dist-1';
	const TENANT_ID = 'tenant-1';

	function makeService(opts: {
		tickets: Partial<OrchestrationTicketOrmEntity>[];
		distTenantId?: string | null; // null = distribution không tồn tại
	}) {
		const ticketRepo = {
			find: jest.fn().mockResolvedValue(opts.tickets),
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
		const service = new DistributionTicketQueryService(
			ticketRepo as never,
			distRepo as never,
		);
		return { service, ticketRepo, distRepo };
	}

	it('map metadata.items[] + context; ticket không metadata → items rỗng', async () => {
		const { service } = makeService({
			tickets: [
				{
					id: 't1',
					distributionId: DIST_ID,
					channelId: null,
					reason: 'REVIEW_REJECT',
					detail: 'x',
					status: 'open',
					metadata: {
						items: [
							{ code: 'C1', message: 'm', severity: 'error' },
						],
						context: { upc: '123' },
					},
					createdAt: new Date(),
					resolvedAt: null,
				},
				{
					id: 't2',
					distributionId: DIST_ID,
					channelId: null,
					reason: 'QA_FLAG',
					detail: 'y',
					status: 'resolved',
					metadata: null,
					createdAt: new Date(),
					resolvedAt: new Date(),
				},
			],
		});

		const result = await service.listByDistribution(DIST_ID);

		expect(result).toHaveLength(2);
		expect(result[0].items).toHaveLength(1);
		expect(result[0].context).toEqual({ upc: '123' });
		expect(result[1].items).toEqual([]);
		expect(result[1].context).toBeNull();
	});

	it('distribution không tồn tại → NotFoundException', async () => {
		const { service } = makeService({ tickets: [], distTenantId: null });
		await expect(service.listByDistribution(DIST_ID)).rejects.toThrow(
			NotFoundException,
		);
	});

	it('tenant out of scope → ForbiddenException', async () => {
		const { service } = makeService({
			tickets: [],
			distTenantId: TENANT_ID,
		});
		await expect(
			service.listByDistribution(DIST_ID, ['other-tenant']),
		).rejects.toThrow(ForbiddenException);
	});

	it('allowedTenantIds undefined (admin) → bỏ qua scope', async () => {
		const { service } = makeService({
			tickets: [],
			distTenantId: TENANT_ID,
		});
		await expect(
			service.listByDistribution(DIST_ID, undefined),
		).resolves.toEqual([]);
	});
});
