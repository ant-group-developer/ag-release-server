import { ExportRunner, ExportRunnerDeps } from './export-runner';

describe('ExportRunner metadata windows', () => {
	it('fetches each window identifier once and preserves the existing release lookup rule', async () => {
		const pgQuery = jest
			.fn()
			.mockResolvedValueOnce([
				{
					isrc: 'ISRC-1',
					workspace_name: 'Workspace',
					release_title: 'Track release',
					release_upc: '111111111111',
					catalog_id: '',
					release_date: null,
					track_title: 'Track',
					label_name: 'Label',
					artist_names: 'Artist',
				},
			])
			.mockResolvedValueOnce([
				{
					upc: '111111111111',
					workspace_name: 'Workspace',
					release_title: 'Release metadata',
					release_upc: '111111111111',
					catalog_id: '',
					release_date: null,
					track_title: '',
					label_name: 'Release label',
					artist_names: 'Release artist',
				},
			])
			.mockResolvedValueOnce([
				{
					id: '11111111-1111-4111-8111-111111111111',
					tenant_name: 'Workspace',
				},
			]);
		const deps = { pgQuery } as unknown as ExportRunnerDeps;
		const runner = new ExportRunner(deps, 'job-1') as any;
		const cache = runner.createMetadataCache();
		const row = {
			isrc: 'ISRC-1',
			fallback_upc: '999999999999',
			tenant_id: '11111111-1111-4111-8111-111111111111',
		} as any;

		await runner.hydrateMetadataWindow([row], cache);
		await runner.hydrateMetadataWindow([row], cache);

		expect(pgQuery).toHaveBeenCalledTimes(3);
		expect(pgQuery.mock.calls[1][1]).toEqual([['111111111111']]);
	});
});
