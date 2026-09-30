import { DataSource } from 'typeorm';
import { ReleaseMergeService } from './release-merge.service';

function release(partial: Record<string, unknown>) {
	return {
		id: '00000000-0000-4000-8000-000000000001',
		upc: '5034644545356',
		title: 'Canonical Album',
		type: 'audio',
		tenantId: '00000000-0000-4000-8000-000000000010',
		labelId: null,
		isImportedFromReport: false,
		updatedAt: new Date('2026-09-29T00:00:00Z'),
		...partial,
	} as any;
}

function track(partial: Record<string, unknown>) {
	return {
		id: 'track00001',
		releaseId: '00000000-0000-4000-8000-000000000001',
		isrc: 'US38Y2521676',
		isImportedFromReport: false,
		...partial,
	} as any;
}

describe('ReleaseMergeService pair planning', () => {
	const service = new ReleaseMergeService({} as DataSource);
	const target = release({});
	const source = release({
		id: '00000000-0000-4000-8000-000000000002',
		title: 'Imported Album',
		isImportedFromReport: true,
	});

	it('allows a report source whose complete ISRC set is covered by the canonical target', () => {
		const plan = service.buildPairPlan(source, target, [
			track({ releaseId: target.id }),
			track({
				id: 'track00002',
				releaseId: source.id,
				isImportedFromReport: true,
			}),
		]);

		expect(plan.autoSafe).toBe(true);
		expect(plan.sharedIsrcs).toEqual(['US38Y2521676']);
		expect(plan.sourceOnlyIsrcs).toEqual([]);
	});

	it('stays auto-safe when the source has extra ISRCs so merge can detach them', () => {
		const plan = service.buildPairPlan(source, target, [
			track({ releaseId: target.id }),
			track({
				id: 'track00002',
				releaseId: source.id,
				isImportedFromReport: true,
			}),
			track({
				id: 'track00003',
				releaseId: source.id,
				isrc: 'US38Y2521677',
				isImportedFromReport: true,
			}),
		]);

		expect(plan.autoSafe).toBe(true);
		expect(plan.reasonCodes).not.toContain('SOURCE_HAS_UNMATCHED_TRACKS');
		expect(plan.sourceOnlyIsrcs).toEqual(['US38Y2521677']);
	});

	it('blocks canonical-to-canonical deletion', () => {
		const plan = service.buildPairPlan(
			release({ ...source, isImportedFromReport: false }),
			target,
			[
				track({ releaseId: target.id }),
				track({ id: 'track00002', releaseId: source.id }),
			],
		);

		expect(plan.autoSafe).toBe(false);
		expect(plan.reasonCodes).toContain('SOURCE_NOT_IMPORTED');
	});

	it('allows force only for structurally identical pairs blocked by UPC', () => {
		const plan = service.buildPairPlan(
			release({ ...source, upc: '1111111111111' }),
			target,
			[
				track({ releaseId: target.id }),
				track({
					id: 'track00002',
					releaseId: source.id,
					isImportedFromReport: true,
				}),
			],
		);

		expect(plan.reasonCodes).toEqual(['UPC_NOT_EQUIVALENT']);
		expect(service.isForceEligible(plan)).toBe(true);
	});
});
