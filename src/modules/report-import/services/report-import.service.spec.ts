import { plainToInstance } from 'class-transformer';
import { TwentyTwoRWmgConfig } from '../configs/22r-report.config';
import { writeReportConfigExtensions } from '../configs/report-config.util';
import { UpdateReportSourceConfigDto } from '../dto/report-source-config.dto';
import { ReportImportService } from './report-import.service';
import { ReportSourceConfigService } from './report-source-config.service';

describe('Report import configuration and upload', () => {
	function setup() {
		const detector = {
			detectConfig: jest
				.fn()
				.mockResolvedValue({
					...TwentyTwoRWmgConfig,
					id: '22r_wmg_sales',
				}),
		};
		const r2 = {
			getSignedUrlUpload: jest.fn().mockResolvedValue('url'),
			getBucketName: jest.fn().mockReturnValue('private'),
			findOne: jest.fn().mockResolvedValue({ contentLength: 100 }),
		};
		const jobs = {
			create: jest.fn().mockResolvedValue({ id: 'job' }),
			getSnapshot: jest.fn(),
			markFailed: jest.fn().mockResolvedValue(undefined),
			markQueued: jest
				.fn()
				.mockResolvedValue({ id: 'job', status: 'QUEUED' }),
		};
		const queue = { pushJob: jest.fn() };
		const service = new ReportImportService(
			detector as never,
			queue as never,
			r2 as never,
			jobs as never,
			{} as never,
		);
		return { service, detector, r2, jobs, queue };
	}
	it('snapshots all parser options and uses wmg_report independently of sourceCode', async () => {
		const s = setup();
		await s.service.preValidate(
			[{ path: 'folder/report.csv', size: 100 }],
			'tenant',
			'user',
		);
		const file = s.jobs.create.mock.calls[0][0].params.files[0];
		expect(file).toMatchObject({
			sourceCode: '22r_wmg',
			importSource: 'wmg_report',
			defaultCurrency: 'USD',
			parserOptions: { numericIdentifierIsUpc: true },
			requiredHeaders: TwentyTwoRWmgConfig.requiredHeaders,
			fieldMappings: TwentyTwoRWmgConfig.fieldMappings,
		});
		expect(file.configHash).toMatch(/^[a-f0-9]{64}$/);
	});
	it('rejects repeated basenames before generating upload URLs', async () => {
		const s = setup();
		await expect(
			s.service.preValidate(
				[
					{ path: 'a/report.csv', size: 1 },
					{ path: 'b\\report.csv', size: 1 },
				],
				'tenant',
				'user',
			),
		).rejects.toThrow('Duplicate');
		expect(s.r2.getSignedUrlUpload).not.toHaveBeenCalled();
	});
	it('blocks size mismatches before enqueueing', async () => {
		const s = setup();
		s.jobs.getSnapshot.mockReturnValue({
			id: 'job',
			status: 'PENDING',
			params: {
				files: [{ path: 'report.csv', r2Key: 'key', size: 101 }],
			},
		});
		await expect(s.service.startJob('job')).rejects.toThrow();
		expect(s.queue.pushJob).not.toHaveBeenCalled();
	});
	it('does not reset saved defaults/mappings when updating only the display name', async () => {
		const c = TwentyTwoRWmgConfig;
		const db = {
			query: jest
				.fn()
				.mockResolvedValue([
					{
						id: '22r_wmg_sales',
						source_code: c.sourceCode,
						source_name: c.sourceName,
						report_type: c.reportType,
						folder_patterns: c.folderPatterns,
						file_patterns: c.filePatterns,
						required_headers: c.requiredHeaders,
						parser_code: c.parserCode,
						delimiter: c.delimiter,
						default_currency: c.defaultCurrency,
						default_member: c.defaultMember,
						priority: c.priority,
						created_at: '2026-01-01 00:00:00',
						...writeReportConfigExtensions(c),
					},
				]),
			insertBatched: jest.fn(),
		};
		const svc = new ReportSourceConfigService(db as never);
		await svc.update(
			'22r_wmg_sales',
			plainToInstance(UpdateReportSourceConfigDto, {
				sourceName: 'New name',
			}),
		);
		const saved = db.insertBatched.mock.calls[0][1][0];
		expect(saved).toMatchObject({
			source_name: 'New name',
			default_currency: 'USD',
			default_member: c.defaultMember,
			priority: 10,
			import_source: 'wmg_report',
		});
		expect(JSON.parse(saved.field_mappings_json)).toEqual(c.fieldMappings);
	});
});
