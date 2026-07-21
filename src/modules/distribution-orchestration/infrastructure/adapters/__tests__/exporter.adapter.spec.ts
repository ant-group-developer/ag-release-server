import { Aggregator } from '../../../../distribution/aggregator/entities/aggregator.entity';
import { NotificationResendService } from '../../../../notification/services/notification.resend-service';
import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { ExporterAdapter } from '../exporter.adapter';

const mockState51Aggregator = {
	id: 'agg-state51',
	code: 'STATE51',
	name: 'State51',
	isActive: true,
	deliveryEmail: 'delivery@state51.com',
	deliveryEmailSubject: 'State51 Batch Delivery',
} as Aggregator;

describe('ExporterAdapter', () => {
	let adapter: ExporterAdapter;
	let resendService: jest.Mocked<NotificationResendService>;
	let aggregatorRepo: { findOne: jest.Mock };

	beforeEach(() => {
		resendService = {
			sendEmail: jest.fn().mockResolvedValue(true),
		} as any;

		aggregatorRepo = {
			findOne: jest.fn().mockResolvedValue(mockState51Aggregator),
		};

		adapter = new ExporterAdapter(resendService, aggregatorRepo as any);
	});

	describe('CI_DEAL', () => {
		it('returns ExportJobRef without calling external services (no-op)', async () => {
			const result = await adapter.export({
				method: 'CI_DEAL',
				upcs: ['0850080651804'],
				key: IdempotencyKey.create('ci-deal-key-1'),
			});

			expect(result).toEqual({ jobId: 'ci-deal-key-1' });
			expect(resendService.sendEmail).not.toHaveBeenCalled();
			expect(aggregatorRepo.findOne).not.toHaveBeenCalled();
		});

		it('handles multiple UPCs', async () => {
			const result = await adapter.export({
				method: 'CI_DEAL',
				upcs: ['UPC1', 'UPC2', 'UPC3'],
				key: IdempotencyKey.create('ci-deal-key-2'),
			});

			expect(result.jobId).toBe('ci-deal-key-2');
		});
	});

	describe('STATE51', () => {
		it('sends email via Resend to aggregator deliveryEmail', async () => {
			const result = await adapter.export({
				method: 'STATE51',
				upcs: ['0850080651804'],
				key: IdempotencyKey.create('state51-key-1'),
			});

			expect(aggregatorRepo.findOne).toHaveBeenCalledWith({
				where: { code: 'STATE51', isActive: true },
			});

			expect(resendService.sendEmail).toHaveBeenCalledWith({
				to: ['delivery@state51.com'],
				subject: 'State51 Batch Delivery',
				html: expect.stringContaining('0850080651804'),
			});

			expect(result).toEqual({ jobId: 'state51-key-1' });
		});

		it('uses recipients override when provided', async () => {
			await adapter.export({
				method: 'STATE51',
				upcs: ['UPC1'],
				recipients: ['override@test.com'],
				key: IdempotencyKey.create('state51-key-2'),
			});

			expect(resendService.sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: ['override@test.com'],
				}),
			);
		});

		it('throws when aggregator missing deliveryEmail', async () => {
			aggregatorRepo.findOne.mockResolvedValue({
				...mockState51Aggregator,
				deliveryEmail: null,
			});

			await expect(
				adapter.export({
					method: 'STATE51',
					upcs: ['UPC1'],
					key: IdempotencyKey.create('state51-key-3'),
				}),
			).rejects.toThrow(/missing deliveryEmail/);
		});

		it('throws when State51 aggregator not found', async () => {
			aggregatorRepo.findOne.mockResolvedValue(null);

			await expect(
				adapter.export({
					method: 'STATE51',
					upcs: ['UPC1'],
					key: IdempotencyKey.create('state51-key-4'),
				}),
			).rejects.toThrow(/missing deliveryEmail/);
		});

		it('throws when email service fails', async () => {
			resendService.sendEmail.mockResolvedValue(false);

			await expect(
				adapter.export({
					method: 'STATE51',
					upcs: ['UPC1'],
					key: IdempotencyKey.create('state51-key-5'),
				}),
			).rejects.toThrow(/email failed/);
		});

		it('falls back to default subject when not configured', async () => {
			aggregatorRepo.findOne.mockResolvedValue({
				...mockState51Aggregator,
				deliveryEmailSubject: null,
			});

			await adapter.export({
				method: 'STATE51',
				upcs: ['UPC_TEST'],
				key: IdempotencyKey.create('state51-key-6'),
			});

			expect(resendService.sendEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					subject: 'State51 Delivery - UPC_TEST',
				}),
			);
		});
	});

	describe('Unknown method', () => {
		it('throws for unsupported export method', async () => {
			await expect(
				adapter.export({
					method: 'UNKNOWN' as any,
					upcs: ['UPC1'],
					key: IdempotencyKey.create('unknown-key'),
				}),
			).rejects.toThrow(/unknown export method/);
		});
	});
});
