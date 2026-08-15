import { ImportJobReportSource, ImportJobSourceType } from '../../interfaces';
import { ImportJobsService } from './import-jobs.service';

describe('ImportJobsService.list reportSource filter', () => {
	function createService() {
		const clickHouseService = { query: jest.fn() };
		const service = new ImportJobsService(
			clickHouseService as never,
			{ emit: jest.fn() } as never,
			{} as never,
		);
		return { clickHouseService, service };
	}

	it('filters Spotify REPORT_UPLOAD jobs by active configured file patterns', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query
			.mockResolvedValueOnce([
				{ file_patterns: ['spotify-track-for-.*\\.txt$'] },
			])
			.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.SPOTIFY });

		expect(clickHouseService.query).toHaveBeenCalledTimes(2);
		expect(clickHouseService.query.mock.calls[0][1]).toEqual({
			sourceCode: 'spotify',
		});
		const [countSql, params] = clickHouseService.query.mock.calls[1];
		expect(countSql).toContain(
			'source_type = {reportUploadSourceType:String}',
		);
		expect(countSql).toContain('arrayExists(pattern -> match(file_name');
		expect(params).toMatchObject({
			reportUploadSourceType: ImportJobSourceType.REPORT_UPLOAD,
			reportSourcePatterns: ['spotify-track-for-.*\\.txt$'],
		});
	});

	it('groups only the expected FTP job types for Merlin', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.MERLIN });

		expect(clickHouseService.query).toHaveBeenCalledTimes(1);
		const [countSql, params] = clickHouseService.query.mock.calls[0];
		expect(countSql).toContain(
			'source_type IN ({merlinSourceTypes:Array(String)})',
		);
		expect(params.merlinSourceTypes).toEqual([
			ImportJobSourceType.FTP_SYNC_PERIOD,
			ImportJobSourceType.FTP_SYNC_ALL,
			ImportJobSourceType.FTP_RETRY,
			ImportJobSourceType.FTP_AUTO_CRON,
		]);
	});

	it('returns no Warner jobs when no active Warner pattern is configured', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.WARNER });

		const [countSql] = clickHouseService.query.mock.calls[1];
		expect(countSql).toContain('WHERE 0');
	});
});
