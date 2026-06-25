import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, Repository } from 'typeorm';
import { DomainStatus, TenantDomain } from './entities/tenant-domain.entity';
import { TenantDomainService } from './tenant-domain.service';

@Injectable()
export class DomainHealthCron {
	private readonly logger = new Logger(DomainHealthCron.name);

	constructor(
		@InjectRepository(TenantDomain)
		private readonly repo: Repository<TenantDomain>,
		private readonly tenantDomainService: TenantDomainService,
	) {}

	@Cron('0 3 * * *')
	async checkAllDomains(): Promise<void> {
		this.logger.log('Starting domain health check');

		const domains = await this.repo.find({
			where: { status: In([DomainStatus.ACTIVE, DomainStatus.VERIFYING]) },
		});

		if (!domains.length) {
			this.logger.log('No domains to check');
			return;
		}

		const CHUNK = 20;
		for (let i = 0; i < domains.length; i += CHUNK) {
			await Promise.all(
				domains.slice(i, i + CHUNK).map((d) =>
					this.tenantDomainService.checkDomainHealth(d),
				),
			);
		}

		this.logger.log(`Domain health check completed for ${domains.length} domains`);
	}
}
