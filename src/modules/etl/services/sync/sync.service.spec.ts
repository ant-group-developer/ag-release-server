import { Test } from '@nestjs/testing';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import { FtpParserConfigService } from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { ClickHouseService } from '../../../clickhouse';
import { AnalyticsProjectionRefreshService } from '../cube-rebuild/analytics-projection-refresh.service';
import { EtlImportHistoryRepository } from '../etl-import-history/etl-import-history.repository';
import { FtpAuthenticationError, FtpService } from '../ftp/ftp.service';
import { ImportService } from '../import/import.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
	let service: SyncService;
	let sessions: Array<{ close: jest.Mock }>;

	const ftpService = {
		createSession: jest.fn(),
		listDspFolders: jest.fn(),
		listRemoteFiles: jest.fn(),
		downloadDspFolder: jest.fn(),
		listPeriods: jest.fn(),
		cleanupTemp: jest.fn(),
	};
	const importService = { importDspFolder: jest.fn() };
	const clickHouseService = { query: jest.fn(), insert: jest.fn(), command: jest.fn() };
	const redis = { keys: jest.fn().mockResolvedValue([]), del: jest.fn() };
	const excludePatternService = { shouldExclude: jest.fn() };
	const analyticsProjectionRefreshService = {
		refreshAfterFactImport: jest.fn(),
	};
	const ftpParserConfigService = { resolveForParserCode: jest.fn() };
	const ftpReportFileRuleService = { resolveFiles: jest.fn() };
	const etlImportHistoryRepository = { upsert: jest.fn() };

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				SyncService,
				{ provide: FtpService, useValue: ftpService },
				{ provide: ImportService, useValue: importService },
				{ provide: ClickHouseService, useValue: clickHouseService },
				{
					provide: 'default_IORedisModuleConnectionToken',
					useValue: redis,
				},
				{
					provide: ExcludePatternService,
					useValue: excludePatternService,
				},
				{
					provide: AnalyticsProjectionRefreshService,
					useValue: analyticsProjectionRefreshService,
				},
				{
					provide: FtpParserConfigService,
					useValue: ftpParserConfigService,
				},
				{
					provide: FtpReportFileRuleService,
					useValue: ftpReportFileRuleService,
				},
				{
					provide: EtlImportHistoryRepository,
					useValue: etlImportHistoryRepository,
				},
			],
		}).compile();

		service = moduleRef.get(SyncService);

		jest.clearAllMocks();
		sessions = [];

		ftpService.createSession.mockImplementation(() => {
			const session = { close: jest.fn() };
			sessions.push(session);
			return session;
		});
		// No sync_* rows and no import history: every folder looks brand new.
		clickHouseService.query.mockResolvedValue([]);
		excludePatternService.shouldExclude.mockResolvedValue(false);
		ftpService.cleanupTemp.mockReturnValue(undefined);
		etlImportHistoryRepository.upsert.mockResolvedValue(undefined);
	});

	/** Wires up the happy path for a folder that imports cleanly. */
	const givenImportableFolder = (rows = 10) => {
		ftpService.listRemoteFiles.mockResolvedValue(['report.tsv']);
		ftpReportFileRuleService.resolveFiles.mockResolvedValue({
			selected: ['report.tsv'],
			ignored: [],
			pending: [],
			parserCode: 'generic',
		});
		ftpParserConfigService.resolveForParserCode.mockResolvedValue({
			configVersion: 1,
			selectFile: () => true,
		});
		ftpService.downloadDspFolder.mockResolvedValue({
			localPath: '/tmp/x',
			fileCount: 1,
		});
		importService.importDspFolder.mockResolvedValue({
			rows,
			files: 1,
			fileStats: [],
		});
	};

	describe('syncPeriod connection reuse', () => {
		it('leases exactly one connection per DSP folder', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a', 'dsp-b']);
			givenImportableFolder();

			await service.syncPeriod('202401', false, ['trends']);

			expect(sessions).toHaveLength(2);
			for (const session of sessions) {
				expect(session.close).toHaveBeenCalledTimes(1);
			}
		});

		it('passes that session to every FTP call for the folder', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);
			givenImportableFolder();

			await service.syncPeriod('202401', false, ['trends']);

			const session = sessions[0];
			// Both listings and the download must ride the same login, otherwise
			// the folder still costs three of them.
			expect(ftpService.listRemoteFiles).toHaveBeenCalledTimes(2);
			for (const call of ftpService.listRemoteFiles.mock.calls) {
				expect(call[5]).toBe(session);
			}
			expect(ftpService.downloadDspFolder).toHaveBeenCalledTimes(1);
			expect(ftpService.downloadDspFolder.mock.calls[0][5]).toBe(session);
		});

		it('closes the session even when the folder errors out', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);
			givenImportableFolder();
			ftpService.downloadDspFolder.mockRejectedValue(
				new Error('read timeout'),
			);

			const result = await service.syncPeriod('202401', false, ['trends']);

			expect(sessions[0].close).toHaveBeenCalledTimes(1);
			expect(result.categories[0].folders[0].status).toBe('error');
		});

		it('closes the session when the folder is skipped early', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);
			ftpService.listRemoteFiles.mockResolvedValue([]);
			ftpReportFileRuleService.resolveFiles.mockResolvedValue({
				selected: [],
				ignored: [],
				pending: [],
				parserCode: '',
			});

			const result = await service.syncPeriod('202401', false, ['trends']);

			expect(sessions[0].close).toHaveBeenCalledTimes(1);
			expect(result.categories[0].folders[0].status).toBe('skipped');
		});
	});

	describe('syncPeriod error handling', () => {
		it('keeps going to the next folder after a non-auth failure', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a', 'dsp-b']);
			givenImportableFolder();
			ftpService.downloadDspFolder
				.mockRejectedValueOnce(new Error('read timeout'))
				.mockResolvedValue({ localPath: '/tmp/x', fileCount: 1 });

			const result = await service.syncPeriod('202401', false, ['trends']);

			const statuses = result.categories[0].folders.map((f) => f.status);
			expect(statuses).toEqual(['error', 'done']);
		});

		it('aborts the whole period on a 530 and still closes the session', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a', 'dsp-b']);
			givenImportableFolder();
			ftpService.downloadDspFolder.mockRejectedValue(
				new FtpAuthenticationError('530 Login incorrect.'),
			);

			await expect(
				service.syncPeriod('202401', false, ['trends']),
			).rejects.toBeInstanceOf(FtpAuthenticationError);

			// Only the first folder was attempted; its session was released.
			expect(sessions).toHaveLength(1);
			expect(sessions[0].close).toHaveBeenCalledTimes(1);
		});
	});

	describe('getStatus', () => {
		it('lists every period and category over a single connection', async () => {
			ftpService.listPeriods.mockResolvedValue(['202401', '202402']);
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);

			await service.getStatus();

			expect(sessions).toHaveLength(1);
			expect(sessions[0].close).toHaveBeenCalledTimes(1);
			expect(ftpService.listPeriods).toHaveBeenCalledWith(sessions[0]);
			// 2 periods × trends/usage, all on the one session.
			expect(ftpService.listDspFolders).toHaveBeenCalledTimes(4);
			for (const call of ftpService.listDspFolders.mock.calls) {
				expect(call[2]).toBe(sessions[0]);
			}
		});

		it('closes the connection when listing fails', async () => {
			ftpService.listPeriods.mockRejectedValue(new Error('boom'));

			await expect(service.getStatus()).rejects.toThrow('boom');
			expect(sessions[0].close).toHaveBeenCalledTimes(1);
		});
	});
});
