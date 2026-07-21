import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Aggregator } from '../../../distribution/aggregator/entities/aggregator.entity';
import { NotificationResendService } from '../../../notification/services/notification.resend-service';
import { ExportMethod } from '../../domain/channel-delivery/channel-delivery-spec';
import { Exporter, ExportJobRef } from '../../domain/ports/exporter.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';

/**
 * ExporterAdapter — facade for CI_DEAL and STATE51 export methods.
 *
 * CI_DEAL: No-op — CI auto-imports when .done file appears (handled by
 *          SftpUploaderAdapter.markBatchDone). This step only marks "exported".
 *
 * STATE51: Sends email via Resend API (NotificationResendService) to the
 *          aggregator's deliveryEmail. V1 sends text-only (no Excel attachment).
 */
@Injectable()
export class ExporterAdapter implements Exporter {
	private readonly logger = new Logger(ExporterAdapter.name);

	constructor(
		private readonly resendService: NotificationResendService,
		@InjectRepository(Aggregator)
		private readonly aggregatorRepo: Repository<Aggregator>,
	) {}

	async export(input: {
		method: ExportMethod;
		upcs: string[];
		recipients?: string[];
		key: IdempotencyKey;
	}): Promise<ExportJobRef> {
		switch (input.method) {
			case 'CI_DEAL':
				return this.exportCiDeal(input);
			case 'STATE51':
				return this.exportState51(input);
			default:
				throw new Error(
					`ExporterAdapter: unknown export method "${input.method}"`,
				);
		}
	}

	/**
	 * CI_DEAL — no-op. CI auto-imports when batch + .done file appear on SFTP.
	 * This step exists only to satisfy the orchestration flow (WAIT_EXPORT stage).
	 */
	private async exportCiDeal(input: {
		upcs: string[];
		key: IdempotencyKey;
	}): Promise<ExportJobRef> {
		this.logger.log(
			`[CI_DEAL] No-op export for UPCs: ${input.upcs.join(', ')}`,
		);

		return { jobId: input.key.value };
	}

	/**
	 * STATE51 — send delivery email via Resend API.
	 *
	 * V3 reference: release-execution3.worker.ts:682-760 + ci-distribution-job3.service.ts:336-440
	 *
	 * V1: text-only email (no Excel attachment). Excel export deferred to future iteration.
	 */
	private async exportState51(input: {
		upcs: string[];
		recipients?: string[];
		key: IdempotencyKey;
	}): Promise<ExportJobRef> {
		// 1. Resolve deliveryEmail from aggregator
		const { deliveryEmail, subject } = await this.resolveState51EmailConfig(
			input.upcs,
		);

		const toAddresses = input.recipients?.length
			? input.recipients
			: [deliveryEmail];

		this.logger.log(
			`[STATE51] Sending email to ${toAddresses.join(', ')} for UPCs: ${input.upcs.join(', ')}`,
		);

		// 2. Build email body
		const html = [
			`<p>${input.upcs.length} release(s) for distribution</p>`,
			`<ul>`,
			...input.upcs.map((upc) => `  <li>${upc}</li>`),
			`</ul>`,
		].join('\n');

		// 3. Send via Resend
		const success = await this.resendService.sendEmail({
			to: toAddresses,
			subject,
			html,
		});

		if (!success) {
			throw new Error(
				`ExporterAdapter: STATE51 email failed for UPCs: ${input.upcs.join(', ')}`,
			);
		}

		this.logger.log(
			`[STATE51] Email sent successfully to ${toAddresses.join(', ')}`,
		);

		return { jobId: input.key.value };
	}

	/**
	 * Resolve State51 aggregator's deliveryEmail and subject.
	 * Falls back to default aggregator if no State51-specific one found.
	 */
	private async resolveState51EmailConfig(upcs: string[]): Promise<{
		deliveryEmail: string;
		subject: string;
	}> {
		// Try to find the State51 aggregator by code
		const aggregator = await this.aggregatorRepo.findOne({
			where: { code: 'STATE51', isActive: true },
		});

		const deliveryEmail = aggregator?.deliveryEmail;
		if (!deliveryEmail) {
			throw new Error(
				'ExporterAdapter: State51 aggregator missing deliveryEmail',
			);
		}

		const subject =
			aggregator?.deliveryEmailSubject ??
			`State51 Delivery - ${upcs[0] ?? 'batch'}`;

		return { deliveryEmail, subject };
	}
}
