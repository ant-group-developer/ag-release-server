import { Module } from '@nestjs/common';
import { CiApiService } from './ci-api.service';
import { CiDeliverDesireApiService } from './ci-deliver-desire-api.service';
import { CiImportApiService } from './ci-import-api.service';
import { CiQaApiService } from './ci-qa-api.service';

/**
 * CiApiModule — CI API client services for distribution orchestration.
 *
 * Provides:
 * - CiApiService (base HTTP client)
 * - CiImportApiService (B7: import batch checking)
 * - CiQaApiService (B8: QA flags checking)
 * - CiDeliverDesireApiService (B10: DSP delivery status)
 *
 * Configuration:
 * - Requires CI_API_CONFIG provider in parent module
 * - Config includes: baseUrl, organisationId, token, timeout
 */
@Module({
	providers: [
		CiApiService,
		CiImportApiService,
		CiQaApiService,
		CiDeliverDesireApiService,
	],
	exports: [
		CiApiService,
		CiImportApiService,
		CiQaApiService,
		CiDeliverDesireApiService,
	],
})
export class CiApiModule {}
