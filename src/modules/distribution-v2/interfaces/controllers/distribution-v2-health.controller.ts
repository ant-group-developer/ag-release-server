import { Controller, Get } from '@nestjs/common';
import { DistributionV2ConfigService } from '../../config/distribution-v2.config.service';

@Controller('distribution-v2')
export class DistributionV2HealthController {
	constructor(private readonly config: DistributionV2ConfigService) {}

	@Get('health')
	getHealth() {
		return {
			module: 'distribution-v2',
			enabled: this.config.isEnabled(),
			schema: 'distribution_v2',
			queuePrefix: this.config.getQueuePrefix(),
			packageSharedRoot: this.config.getPackageSharedRoot(),
		};
	}
}

