import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
	CiDistributionJob,
	CiJobStatus,
	CiJobType,
} from '../entities/ci-distribution-job.entity';

import { CiDistributionJobService } from './ci-distribution-job.service';

describe('CiDistributionJobService', () => {
	let service: CiDistributionJobService;

	let repo: jest.Mocked<Repository<CiDistributionJob>>;

	beforeEach(async () => {
		repo = {
			find: jest.fn(),
		} as any;

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CiDistributionJobService,
				{
					provide: getRepositoryToken(CiDistributionJob),
					useValue: repo,
				},

				// mock các dependency khác
				{
					provide: 'ReleaseSubmitService2',
					useValue: {},
				},
				{
					provide: 'LogsService',
					useValue: {},
				},
				{
					provide: 'FileExportCiService',
					useValue: {},
				},
				{
					provide: 'NotificationResendService',
					useValue: {},
				},
				{
					provide: 'SchedulerRegistry',
					useValue: {},
				},
				{
					provide: 'AppConfigService',
					useValue: {},
				},
			],
		}).compile();

		service = module.get(CiDistributionJobService);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('handleDailySend', () => {
		it('should do nothing when no pending jobs', async () => {
			repo.find.mockResolvedValue([]);

			const autoSendSpy = jest.spyOn(service, 'autoSendEmail');

			await service.handleDailySend();

			expect(repo.find).toHaveBeenCalledWith({
				where: {
					type: CiJobType.EMAIL_STATE51,
					status: CiJobStatus.PENDING,
				},
				order: {
					createdAt: 'ASC',
				},
			});

			expect(autoSendSpy).not.toHaveBeenCalled();
		});

		it('should call autoSendEmail with job ids', async () => {
			repo.find.mockResolvedValue([
				{
					id: 'job-1',
				},
				{
					id: 'job-2',
				},
			] as any);

			const autoSendSpy = jest
				.spyOn(service, 'autoSendEmail')
				.mockResolvedValue({
					sent: 2,
					resumed: 0,
				});

			await service.handleDailySend();

			expect(autoSendSpy).toHaveBeenCalledWith(['job-1', 'job-2']);
		});
	});
});
