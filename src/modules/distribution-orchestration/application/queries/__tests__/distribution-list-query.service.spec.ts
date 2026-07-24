import { PageDto } from 'src/common/dtos/common.response.dto';
import { DistributionListQueryService } from '../distribution-list-query.service';

/**
 * Unit test DistributionListQueryService — merge DistributionState mới nhất vào list release.
 * Mock ReleaseService.getList + DataSource.query.
 */
describe('DistributionListQueryService', () => {
	function makeService(opts: {
		releases: Array<Record<string, unknown>>;
		distRows: Array<Record<string, unknown>>;
	}) {
		const releaseService = {
			getList: jest.fn().mockResolvedValue(
				new PageDto({
					items: opts.releases,
					metadata: { page: 1, pageSize: 10, totalItems: opts.releases.length },
				}),
			),
		};
		const dataSource = {
			query: jest.fn().mockResolvedValue(opts.distRows),
		};
		const service = new DistributionListQueryService(
			releaseService as never,
			dataSource as never,
		);
		return { service, dataSource };
	}

	const baseQuery = { page: 1, pageSize: 10 } as never;

	it('merge state: release có distribution → gắn state; không có → null', async () => {
		const { service } = makeService({
			releases: [{ id: 'r1', title: 'A' }, { id: 'r2', title: 'B' }],
			distRows: [
				{
					release_id: 'r1',
					id: 'd1',
					state: 'DELIVERING',
					type: 'INITIAL_RELEASE',
					updated_at: new Date().toISOString(),
				},
			],
		});

		const page = await service.list(baseQuery);

		expect(page.items).toHaveLength(2);
		expect(page.items[0]).toMatchObject({
			id: 'r1',
			distributionId: 'd1',
			distributionState: 'DELIVERING',
		});
		expect(page.items[1]).toMatchObject({
			id: 'r2',
			distributionId: null,
			distributionState: null,
		});
	});

	it('filter distributionState → chỉ trả release khớp', async () => {
		const { service } = makeService({
			releases: [{ id: 'r1' }, { id: 'r2' }],
			distRows: [
				{ release_id: 'r1', id: 'd1', state: 'FAILED', type: 'INITIAL_RELEASE', updated_at: new Date().toISOString() },
				{ release_id: 'r2', id: 'd2', state: 'DISTRIBUTED', type: 'INITIAL_RELEASE', updated_at: new Date().toISOString() },
			],
		});

		const page = await service.list(baseQuery, { distributionState: 'FAILED' });

		expect(page.items).toHaveLength(1);
		expect(page.items[0].id).toBe('r1');
	});

	it('empty releases → không query distribution', async () => {
		const { service, dataSource } = makeService({
			releases: [],
			distRows: [],
		});

		const page = await service.list(baseQuery);

		expect(page.items).toHaveLength(0);
		expect(dataSource.query).not.toHaveBeenCalled();
	});
});
