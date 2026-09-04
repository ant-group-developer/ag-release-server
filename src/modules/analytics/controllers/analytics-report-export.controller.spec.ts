import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AnalyticsReportExportController } from './analytics-report-export.controller';

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
			validate(
				{ tenantId: 'A', tenantIds: ['A'] },
				'A',
			),
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
