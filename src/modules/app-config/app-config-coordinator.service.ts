import { Injectable } from '@nestjs/common';
import { AppConfigSyncService } from './app-config-sync.service';
import { AppConfigService } from './app-config.service';
import { UpdateConfigDto } from './dtos/app-config.dto';

@Injectable()
export class AppConfigCoordinatorService {
	constructor(
		private readonly appConfigService: AppConfigService,
		private readonly syncService: AppConfigSyncService,
	) {}

	async update(payload: UpdateConfigDto) {
		const result = await this.appConfigService.update(payload);
		await this.syncService.publishChanged(result);
		return result;
	}

	async refreshCiToolToken() {
		const result = await this.appConfigService.refreshCiToolToken();
		await this.syncService.publishChanged(this.appConfigService.getCache());
		return result;
	}
}
