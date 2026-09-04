import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AnalyticsReportExportDto } from './analytics-report-export.dto';

function validate(payload: Record<string, unknown>) {
	const dto = plainToInstance(AnalyticsReportExportDto, payload, {
		excludeExtraneousValues: false,
	});
	return { dto, errors: validateSync(dto, { whitelist: true }) };
}

describe('AnalyticsReportExportDto date normalization', () => {
	it('accepts full YYYY-MM-DD dates from analytics filters', () => {
		const { dto, errors } = validate({
			fromDate: '2026-03-01',
			endDate: '2026-09-30',
			releaseType: 'video',
			releaseId: 'ed1f091c-3c50-44ba-8a9f-23b8af1d6441',
		});

		expect(errors.map((e) => e.property)).toEqual([]);
		expect(dto.fromDate).toBe('2026-03');
		expect(dto.endDate).toBe('2026-09');
	});

	it('keeps YYYY-MM as-is', () => {
		const { dto, errors } = validate({
			fromDate: '2026-01',
			endDate: '2026-06',
		});

		expect(errors).toHaveLength(0);
		expect(dto.fromDate).toBe('2026-01');
		expect(dto.endDate).toBe('2026-06');
	});

	it('rejects invalid month', () => {
		const { errors } = validate({
			fromDate: '2026-13',
			endDate: '2026-09',
		});

		expect(errors.map((e) => e.property)).toContain('fromDate');
	});
});
