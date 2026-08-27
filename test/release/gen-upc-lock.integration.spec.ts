import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import 'dotenv/config';
import 'reflect-metadata';
import dataSource from 'src/common/config/database.config';
import { AutoSubmitHistory } from 'src/modules/release/entities/auto-submit-history.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseService } from 'src/modules/release/services/release.service';
import { Repository } from 'typeorm';

const run = process.env.RUN_GEN_UPC_INTEGRATION_TEST === 'true';

type Timing = {
	startedAt: number;
	lockAcquiredAt?: number;
	generatedAt?: number;
	completedAt?: number;
	upc?: string;
};

(run ? describe : describe.skip)('genUpcById database locks', () => {
	jest.setTimeout(60_000);
	let repo: Repository<Release>;
	let service: ReleaseService;
	let tenantId: string;
	let nestLogSpy: jest.SpyInstance;
	let activeCalls = 0;
	let maxActiveCalls = 0;
	let sequence = 0;
	const requestContext = new AsyncLocalStorage<{ releaseId: string }>();
	const timings = new Map<string, Timing>();
	const releaseIds: string[] = [];
	const getUpc = jest.fn(async () => {
		const releaseId = requestContext.getStore()?.releaseId ?? 'unknown';
		const timing = timings.get(releaseId);
		if (timing) timing.lockAcquiredAt = Date.now();
		activeCalls++;
		maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
		try {
			await new Promise((resolve) => setTimeout(resolve, 150));
			sequence++;
			const upc = `999${Date.now().toString().slice(-8)}${String(sequence).padStart(3, '0')}`;
			if (timing) {
				timing.generatedAt = Date.now();
				timing.upc = upc;
			}
			return { upc };
		} finally {
			activeCalls--;
		}
	});

	beforeAll(async () => {
		nestLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
		await dataSource.initialize();
		repo = dataSource.getRepository(Release);
		const tenants: { id: string }[] = await dataSource.query(
			'SELECT id FROM tenants ORDER BY created_at LIMIT 1',
		);
		if (!tenants[0]) throw new Error('Test DB needs at least one tenant.');
		tenantId = tenants[0].id;

		const unused = {} as never;
		service = new ReleaseService(
			repo,
			dataSource.getRepository(AutoSubmitHistory),
			{ failed: jest.fn() } as never,
			unused,
			unused,
			unused,
			{ getUpc } as never,
			unused,
			{
				cache: {
					config: {
						generator: { prefixUpcDefaultId: 'test-prefix' },
					},
				},
			} as never,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
			unused,
		);
	});

	afterEach(async () => {
		if (releaseIds.length) {
			const count = releaseIds.length;
			await repo.delete(releaseIds.splice(0));
			console.log(`Cleanup: deleted ${count} temporary releases`);
		}
	});

	afterAll(async () => {
		nestLogSpy?.mockRestore();
		if (dataSource.isInitialized) await dataSource.destroy();
	});

	it('creates 3 releases, runs concurrently, stores unique fake UPCs and cleans up', async () => {
		const marker = `GEN_UPC_LOCK_TEST_${Date.now()}`;
		const releases = await repo.save(
			Array.from({ length: 3 }, (_, i) =>
				repo.create({
					tenantId,
					title: `${marker}_${i + 1}`,
					type: 'audio',
					upc: null,
				}),
			),
		);
		releaseIds.push(...releases.map((release) => release.id));

		const returned = await Promise.all(
			releaseIds.map((id) =>
				requestContext.run({ releaseId: id }, async () => {
					const timing: Timing = { startedAt: Date.now() };
					timings.set(id, timing);
					const upc = await service.genUpcById(id);
					timing.completedAt = Date.now();
					return upc;
				}),
			),
		);
		const saved = await repo.find({
			where: releaseIds.map((id) => ({ id })),
			select: { id: true, upc: true },
		});
		const stored = saved.map((release) => release.upc?.trim());
		const dbMatches =
			stored.slice().sort().join() === returned.slice().sort().join();

		expect(getUpc).toHaveBeenCalledTimes(3);
		expect(maxActiveCalls).toBe(1);
		expect(new Set(returned).size).toBe(3);
		expect(new Set(stored).size).toBe(3);
		expect(dbMatches).toBe(true);

		console.table(
			releaseIds.map((id) => {
				const item = timings.get(id)!;
				return {
					Release: `...${id.slice(-8)}`,
					'Wait lock': `${item.lockAcquiredAt! - item.startedAt} ms`,
					'Gen UPC': `${item.generatedAt! - item.lockAcquiredAt!} ms`,
					Total: `${item.completedAt! - item.startedAt} ms`,
					UPC: item.upc,
				};
			}),
		);
		console.log(`Lock check: ${maxActiveCalls === 1 ? 'PASS' : 'FAIL'}`);
		console.log(`Maximum concurrent generators: ${maxActiveCalls}`);
		console.log(
			`Unique UPCs: ${new Set(returned).size}/${releaseIds.length}`,
		);
		console.log(`DB values matched: ${dbMatches ? 'YES' : 'NO'}`);
	});
});
