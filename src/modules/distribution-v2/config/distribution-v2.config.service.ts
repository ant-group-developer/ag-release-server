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

	getPackageLeaseMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_PACKAGE_LEASE_MS',
			15 * 60 * 1000,
		);
	}

	getPackageRetentionMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_PACKAGE_RETENTION_MS',
			30 * 24 * 60 * 60 * 1000,
		);
	}

	getSftpPerHostConcurrency(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_SFTP_PER_HOST_CONCURRENCY',
			2,
		);
	}

	getSftpRateLimitMs(): number {
		return this.config.get<number>('DISTRIBUTION_V2_SFTP_RATE_LIMIT_MS', 0);
	}

	getSftpTimeoutMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_SFTP_TIMEOUT_MS',
			5 * 60 * 1000,
		);
	}

	getSftpMaxAttempts(): number {
		return this.config.get<number>('DISTRIBUTION_V2_SFTP_MAX_ATTEMPTS', 3);
	}

	getPartnerTimeoutMs(): number {
		return this.config.get<number>(
			'DISTRIBUTION_V2_PARTNER_TIMEOUT_MS',
			5 * 24 * 60 * 60 * 1000,
		);
	}
}
