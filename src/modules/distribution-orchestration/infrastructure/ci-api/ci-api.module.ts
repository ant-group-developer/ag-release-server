import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../../app-config/app-config.module';
import { AppConfigService } from '../../../app-config/app-config.service';
import { CI_API_CONFIG, CiApiConfig } from './ci-api.config';
import { CiApiService } from './ci-api.service';
import { CiDeliverDesireApiService } from './ci-deliver-desire-api.service';
import { CiImportApiService } from './ci-import-api.service';
import { CiQaApiService } from './ci-qa-api.service';

/**
 * CiApiModule — CI API client services for distribution orchestration.
 *
 * Provides:
 * - CI_API_CONFIG (config từ AppConfigService — token phải nằm TRONG module này,
 *   Nest DI không cho provider con thấy provider của module import nó)
 * - CiApiService (base HTTP client)
 * - CiImportApiService (B7: import batch checking)
 * - CiQaApiService (B8: QA flags checking)
 * - CiDeliverDesireApiService (B10: DSP delivery status)
 */
@Module({
	imports: [AppConfigModule],
	providers: [
		{
			provide: CI_API_CONFIG,
			useFactory: (appConfigService: AppConfigService): CiApiConfig => {
				const get = <T>(key: string) =>
					appConfigService.getValue<T>(key);

				return {
					get baseUrl() {
						return get<string>('config.partners.ci.baseUrl') ?? '';
					},
					get organisationId() {
						return (
							get<string>('config.partners.ci.organisationId') ??
							''
						);
					},
					get token() {
						return get<string>('config.partners.ci.token') ?? '';
					},
					timeout: 30000,
				};
			},
			inject: [AppConfigService],
		},
		CiApiService,
		CiImportApiService,
		CiQaApiService,
		CiDeliverDesireApiService,
	],
	exports: [
		CI_API_CONFIG,
		CiApiService,
		CiImportApiService,
		CiQaApiService,
		CiDeliverDesireApiService,
	],
})
export class CiApiModule {}
