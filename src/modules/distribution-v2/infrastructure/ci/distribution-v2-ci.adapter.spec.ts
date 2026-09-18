import { DistributionV2CiAdapter } from './distribution-v2-ci.adapter';

describe('DistributionV2CiAdapter', () => {
	it('polls all import pages and normalizes the target group', async () => {
		const ciImportService = {
			getImports: jest
				.fn()
				.mockResolvedValueOnce({
					page: 0,
					pageSize: 1,
					total: 2,
					_links: { next: { href: 'next' } },
					_embedded: [
						{
							external_identifier: 'group-1',
							status: 'complete',
							import_file: [
								{
									package_id: '0085008065001',
									import_status: 'complete',
								},
							],
						},
					],
				})
				.mockResolvedValueOnce({
					page: 1,
					pageSize: 1,
					total: 2,
					_embedded: [
						{
							external_identifier: 'group-1',
							status: 'complete',
							import_file: [
								{
									package_id: '0085008065001',
									import_status: 'complete',
								},
							],
						},
					],
				}),
		};
		const adapter = new DistributionV2CiAdapter(
			ciImportService as any,
			{} as any,
			{} as any,
		);

		const result = await adapter.checkImport({
			upc: '0085008065001',
			importExternalIdentifier: 'group-1',
			pageSize: 1,
		});

		expect(ciImportService.getImports).toHaveBeenCalledTimes(2);
		expect(result.status).toBe('COMPLETE');
		expect(result.pageCount).toBe(2);
	});

	it('walks QA pages and returns only open blockers', async () => {
		const ciReleaseService = {
			getQaFlagsV2: jest
				.fn()
				.mockResolvedValueOnce({
					page: 0,
					pageSize: 1,
					total: 2,
					_links: { next: { href: 'next' } },
					_embedded: [
						{
							id: 1,
							closed_date: '2026-09-17T00:00:00.000Z',
							qa_flag_type: { is_blocker: true },
						},
					],
				})
				.mockResolvedValueOnce({
					page: 1,
					pageSize: 1,
					total: 2,
					_embedded: [
						{
							id: 2,
							closed_date: null,
							qa_flag_type: { is_blocker: true },
						},
					],
				}),
		};
		const adapter = new DistributionV2CiAdapter(
			{} as any,
			{} as any,
			ciReleaseService as any,
		);

		const result = await adapter.checkQa({
			releaseFormatId: 'release-format-1',
			pageSize: 1,
		});

		expect(ciReleaseService.getQaFlagsV2).toHaveBeenCalledTimes(2);
		expect(result.flags).toHaveLength(2);
		expect(result.blockers).toHaveLength(1);
		expect(result.blockers[0].id).toBe(2);
	});
});
