// tenant-integration.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
	TenantIntegration,
	TenantIntegrationConnection,
} from './entites/tenant-integration.entity';
import { TenantIntegrationQueryService } from './services/tenant-integration-query.service';
import { TenantIntegrationService } from './services/tenant-integration.service';
import { TenantIntegrationController } from './tenant-integration.controller';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			TenantIntegration,
			TenantIntegrationConnection,
		]),
	],
	controllers: [TenantIntegrationController],
	providers: [TenantIntegrationService, TenantIntegrationQueryService],
})
export class TenantIntegrationModule {}
