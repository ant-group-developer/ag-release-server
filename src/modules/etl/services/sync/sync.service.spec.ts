import { Test } from '@nestjs/testing';
import { ClickHouseService } from '../../../clickhouse';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';
import { FtpParserConfigService } from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { AnalyticsProjectionRefreshService } from '../cube-rebuild/analytics-projection-refresh.service';
import { EtlImportHistoryRepository } from '../etl-import-history/etl-import-history.repository';
import { FtpAuthenticationError, FtpService } from '../ftp/ftp.service';
import { ImportService } from '../import/import.service';
import { SyncService } from './sync.service';

describe('SyncService', () => {
	let service: SyncService;
	let sessions: Array<{ close: jest.Mock; invalidate: jest.Mock }>;

	const ftpService = {
		createSession: jest.fn(),
		withSession: jest.fn(),
		listDspFolders: jest.fn(),
		listRemoteFiles: jest.fn(),
		downloadDspFolder: jest.fn(),
		listPeriods: jest.fn(),
		cleanupTemp: jest.fn(),
	};
	const importService = { importDspFolder: jest.fn() };
	const clickHouseService = {
		query: jest.fn(),
		insert: jest.fn(),
		command: jest.fn(),
	};
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
			const session = { close: jest.fn(), invalidate: jest.fn() };
			sessions.push(session);
			return session;
		});
		ftpService.withSession.mockImplementation(async (action) => {
			const session = ftpService.createSession();
			try {
				return await action(session);
			} finally {
				session.close();
			}
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
		it('leases one connection for every DSP folder in the period', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a', 'dsp-b']);
			givenImportableFolder();

			await service.syncPeriod('202401', false, ['trends']);

			expect(sessions).toHaveLength(1);
			for (const session of sessions) {
				expect(session.close).toHaveBeenCalledTimes(1);
			}
		});

		it('passes that session to every FTP call in the period', async () => {
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);
			givenImportableFolder();

			await service.syncPeriod('202401', false, ['trends']);

			const session = sessions[0];
			expect(ftpService.listDspFolders).toHaveBeenCalledWith(
				'trends',
				'202401',
				session,
			);
			// The DSP manifest is listed once, then filtered locally for its rule.
			expect(ftpService.listRemoteFiles).toHaveBeenCalledTimes(1);
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

			const result = await service.syncPeriod('202401', false, [
				'trends',
			]);

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

			const result = await service.syncPeriod('202401', false, [
				'trends',
			]);

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

			const result = await service.syncPeriod('202401', false, [
				'trends',
			]);

			const statuses = result.categories[0].folders.map((f) => f.status);
			expect(statuses).toEqual(['error', 'done']);
		});

		it('imports all 3 Vevo .tsv.zip reports without calling the rule engine', async () => {
			const vevoZips = [
				'bombshelter-digital-services-llc_vevo_merlin_devices_20260801.tsv.zip',
				'bombshelter-digital-services-llc_vevo_merlin_user_attributes_20260801.tsv.zip',
				'bombshelter-digital-services-llc_vevo_merlin_user_interactions_20260801.tsv.zip',
			];
			ftpService.listDspFolders.mockResolvedValue(['vvo-vevo']);
			ftpService.listRemoteFiles.mockResolvedValue([
				...vevoZips,
				'readme.txt',
			]);
			ftpParserConfigService.resolveForParserCode.mockResolvedValue({
				configVersion: 1,
				selectFile: () => false,
			});
			ftpService.downloadDspFolder.mockResolvedValue({
				localPath: '/tmp/vevo',
				fileCount: 3,
			});
			importService.importDspFolder.mockResolvedValue({
				rows: 30,
				files: 3,
				fileStats: [],
			});

			const result = await service.syncPeriod('202608', false, [
				'trends',
			]);

			expect(ftpReportFileRuleService.resolveFiles).not.toHaveBeenCalled();
			expect(
				ftpParserConfigService.resolveForParserCode,
			).toHaveBeenCalledWith('vvo-vevo', 'trends', 'ftp.trends.vvo');
			expect(result.categories[0].folders[0]).toMatchObject({
				dsp_folder: 'vvo-vevo',
				status: 'done',
				files: 3,
			});
			const selectFile = ftpService.downloadDspFolder.mock.calls[0][4];
			expect(vevoZips.every((file) => selectFile(file))).toBe(true);
			expect(selectFile('readme.txt')).toBe(false);
		});

		it('retries the same DSP after an FTP disconnect instead of skipping it', async () => {
			// scd-soundcloud (not vvo-vevo: vevo trends has a dedicated
			// file-selection policy covered in vevo-sync.policy.spec.ts)
			ftpService.listDspFolders.mockResolvedValue([
				'fbk-facebook',
				'scd-soundcloud',
			]);
			givenImportableFolder();
			const disconnect = new Error(
				'Client is closed because Server sent FIN packet unexpectedly, closing connection.',
			);
			ftpService.downloadDspFolder
				.mockRejectedValueOnce(disconnect)
				.mockResolvedValue({ localPath: '/tmp/x', fileCount: 1 });

			const result = await service.syncPeriod('202608', false, [
				'trends',
			]);

			const statuses = result.categories[0].folders.map((f) => f.status);
			expect(statuses).toEqual(['done', 'done']);
			// facebook: fail then retry success; soundcloud: success
			expect(ftpService.downloadDspFolder).toHaveBeenCalledTimes(3);
			expect(sessions[0].invalidate).toHaveBeenCalled();
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

			// Only the first folder was attempted; the period session was released.
			expect(sessions).toHaveLength(1);
			expect(sessions[0].close).toHaveBeenCalledTimes(1);
		});
	});

	describe('syncAll connection reuse', () => {
		it('uses one session across every period while still checking every DSP', async () => {
			ftpService.listPeriods.mockResolvedValue(['202401', '202402']);
			ftpService.listDspFolders.mockResolvedValue(['dsp-a']);
			givenImportableFolder();

			await service.syncAll(false, ['trends']);

			expect(sessions).toHaveLength(1);
			expect(ftpService.listPeriods).toHaveBeenCalledWith(sessions[0]);
			expect(ftpService.listDspFolders).toHaveBeenCalledTimes(2);
			for (const call of ftpService.listDspFolders.mock.calls) {
				expect(call[2]).toBe(sessions[0]);
			}
			expect(ftpService.listRemoteFiles).toHaveBeenCalledTimes(2);
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
