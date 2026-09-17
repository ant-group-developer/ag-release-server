import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DistributionV2ConfigService {
	constructor(private readonly config: ConfigService) {}

	isEnabled(): boolean {
		return this.config.get<boolean>('DISTRIBUTION_V2_ENABLED', false);
	}

	getQueuePrefix(): string {
		return this.config.get<string>(
			'DISTRIBUTION_V2_QUEUE_PREFIX',
			'distribution-v2',
		);
	}

	getPackageSharedRoot(): string {
		return this.config.get<string>(
			'DISTRIBUTION_V2_PACKAGE_SHARED_ROOT',
			'/var/lib/ag-release/distribution-v2',
		);
	}

	getWorkerConcurrency(): number {
		return this.config.get<number>('DISTRIBUTION_V2_WORKER_CONCURRENCY', 4);
	}

	getGeneratorRequestTimeoutMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_GENERATOR_REQUEST_TIMEOUT_MS',
			30_000,
		);
	}

	getOutboxPollIntervalMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_OUTBOX_POLL_INTERVAL_MS',
			2_000,
		);
	}
}
