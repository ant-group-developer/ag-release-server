import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EMPTY, lastValueFrom, toArray } from 'rxjs';
import {
	ImportJobSourceType,
	ImportJobStatus,
} from 'src/modules/etl/interfaces';
import { AnalyticsReportExportController } from './analytics-report-export.controller';

describe('AnalyticsReportExportController terminal SSE snapshot', () => {
	it.each(['COMPLETED', 'FAILED', 'CANCELLED'])(
		'closes the connection for a %s snapshot',
		async (status) => {
			const controller = new AnalyticsReportExportController(
				{} as never,
				{
					findById: jest.fn().mockResolvedValue({
						id: 'job-1',
						tenantId: 'tenant-1',
						status,
						progressTotal: 5,
						params: {},
					}),
				} as never,
				{ subscribe: () => EMPTY } as never,
				{} as never,
			);
			const events = await lastValueFrom(
				controller
					.streamExportEvents(
						{ user: { tenantId: 'tenant-1' } } as any,
						'job-1',
					)
					.pipe(toArray()),
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('snapshot');
		},
	);
});

describe('AnalyticsReportExportController.validateAndResolveTenantIds', () => {
	function createController(descendantIds: string[] = []) {
		const tenantService = {
			getDescendantIds: jest.fn().mockResolvedValue(descendantIds),
		};
		const exportService = { createExportJob: jest.fn() };
		const controller = new AnalyticsReportExportController(
			exportService as never,
			{} as never,
			{} as never,
			tenantService as never,
		);
		return {
			controller,
			tenantService,
			validate: (dto: any, currentTenantId: string) =>
				(controller as any).validateAndResolveTenantIds(
					dto,
					currentTenantId,
				),
		};
	}

	it('rejects tenantId + tenantIds supplied together', async () => {
		const { validate } = createController(['A']);
		await expect(
			validate({ tenantId: 'A', tenantIds: ['A'] }, 'A'),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects a tenantId outside the token descendant tree', async () => {
		const { validate, tenantService } = createController(['A', 'A1']);
		await expect(validate({ tenantId: 'B' }, 'A')).rejects.toBeInstanceOf(
			ForbiddenException,
		);
		expect(tenantService.getDescendantIds).toHaveBeenCalledWith('A');
	});

	it('rejects when any item in tenantIds is outside the token descendant tree', async () => {
		const { validate } = createController(['A', 'A1']);
		await expect(
			validate({ tenantIds: ['A1', 'X'] }, 'A'),
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('accepts tenantId within descendant tree without setting tenantIds', async () => {
		const { validate } = createController(['A', 'A1']);
		const dto: any = { tenantId: 'A1' };
		await validate(dto, 'A');
		expect(dto.tenantIds).toBeUndefined();
	});

	it('defaults to current tenant when nothing supplied', async () => {
		const { validate } = createController(['A']);
		const dto: any = {};
		await validate(dto, 'A');
		expect(dto.tenantIds).toEqual(['A']);
	});

	it('skips descendant validation for system tenant', async () => {
		const { validate, tenantService } = createController([]);
		await expect(
			validate({ tenantIds: ['anything'] }, 'system-tenant'),
		).resolves.toBeUndefined();
		expect(tenantService.getDescendantIds).not.toHaveBeenCalled();
	});
});

describe('AnalyticsReportExportController.exportStatementReport', () => {
	it('keeps the legacy export endpoint on normalized USD mode', async () => {
		const exportService = {
			createExportJob: jest.fn().mockResolvedValue({
				jobId: 'job-usd',
				status: ImportJobStatus.QUEUED,
				eventsUrl: '/analytics/reports/export/job-usd/events',
			}),
		};
		const controller = new AnalyticsReportExportController(
			exportService as never,
			{} as never,
			{} as never,
			{
				getDescendantIds: jest.fn().mockResolvedValue(['tenant-a']),
			} as never,
		);
		const dto: any = {
			fromDate: '2026-01',
			endDate: '2026-01',
			exportMode: 'statement',
		};

		await controller.exportReport(
			{ user: { tenantId: 'tenant-a', sub: 'user-1' } } as any,
			dto,
		);

		expect(dto.exportMode).toBe('usd');
		expect(dto.currency).toBe('USD');
		expect(exportService.createExportJob).toHaveBeenCalledWith(
			'tenant-a',
			'user-1',
			dto,
		);
	});

	it('forces statement mode before creating the export job', async () => {
		const exportService = {
			createExportJob: jest.fn().mockResolvedValue({
				jobId: 'job-1',
				status: ImportJobStatus.QUEUED,
				eventsUrl: '/analytics/reports/export/job-1/events',
			}),
		};
		const tenantService = {
			getDescendantIds: jest.fn().mockResolvedValue(['tenant-a']),
		};
		const controller = new AnalyticsReportExportController(
			exportService as never,
			{} as never,
			{} as never,
			tenantService as never,
		);
		const dto: any = {
			fromDate: '2026-01',
			endDate: '2026-01',
		};

		await controller.exportStatementReport(
			{ user: { tenantId: 'tenant-a', sub: 'user-1' } } as any,
			dto,
		);

		expect(dto.exportMode).toBe('statement');
		expect(exportService.createExportJob).toHaveBeenCalledWith(
			'tenant-a',
			'user-1',
			dto,
		);
	});

	it('keeps an explicit reporting currency on the USD export', async () => {
		const exportService = {
			createExportJob: jest.fn().mockResolvedValue({
				jobId: 'job-vnd',
				status: ImportJobStatus.QUEUED,
				eventsUrl: '/analytics/reports/export/job-vnd/events',
			}),
		};
		const controller = new AnalyticsReportExportController(
			exportService as never,
			{} as never,
			{} as never,
			{
				getDescendantIds: jest.fn().mockResolvedValue(['tenant-a']),
			} as never,
		);
		const dto: any = {
			fromDate: '2026-01',
			endDate: '2026-01',
			currency: 'VND',
		};

		await controller.exportReport(
			{ user: { tenantId: 'tenant-a', sub: 'user-1' } } as any,
			dto,
		);

		expect(dto).toMatchObject({ exportMode: 'usd', currency: 'VND' });
	});

	it('rejects currency on the statement export', async () => {
		const exportService = { createExportJob: jest.fn() };
		const controller = new AnalyticsReportExportController(
			exportService as never,
			{} as never,
			{} as never,
			{
				getDescendantIds: jest.fn().mockResolvedValue(['tenant-a']),
			} as never,
		);

		await expect(
			controller.exportStatementReport(
				{ user: { tenantId: 'tenant-a', sub: 'user-1' } } as any,
				{
					fromDate: '2026-01',
					endDate: '2026-01',
					currency: 'USD',
				} as any,
			),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(exportService.createExportJob).not.toHaveBeenCalled();
	});
});

describe('AnalyticsReportExportController.listExports', () => {
	function createController() {
		const importJobsService = {
			list: jest.fn().mockResolvedValue({ items: [], totalItems: 0 }),
		};
		const controller = new AnalyticsReportExportController(
			{} as never,
			importJobsService as never,
			{} as never,
			{} as never,
		);
		return { controller, importJobsService };
	}

	it('forces a normal tenant onto their own workspace and ignores query.tenantId', async () => {
		const { controller, importJobsService } = createController();
		const req = { user: { tenantId: 'tenant-a' } } as any;

		await controller.listExports(req, {
			page: 1,
			pageSize: 20,
			tenantId: 'someone-else',
			fieldOrder: 'createdAt',
			orderBy: 'DESC',
		} as any);

		expect(importJobsService.list).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
				tenantId: 'tenant-a',
				limit: 20,
				offset: 0,
			}),
		);
	});

	it('lets the system tenant filter by tenantId or see all', async () => {
		const { controller, importJobsService } = createController();
		const req = { user: { tenantId: 'system-tenant' } } as any;

		await controller.listExports(req, {
			page: 2,
			pageSize: 10,
			tenantId: 'workspace-b',
			status: ImportJobStatus.COMPLETED,
			fieldOrder: 'createdAt',
			orderBy: 'DESC',
		} as any);

		expect(importJobsService.list).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
				tenantId: 'workspace-b',
				status: ImportJobStatus.COMPLETED,
				limit: 10,
				offset: 10,
			}),
		);

		await controller.listExports(req, {
			page: 1,
			pageSize: 20,
			fieldOrder: 'createdAt',
			orderBy: 'DESC',
		} as any);

		expect(importJobsService.list).toHaveBeenLastCalledWith(
			expect.objectContaining({
				sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
				tenantId: undefined,
			}),
		);
	});
});
