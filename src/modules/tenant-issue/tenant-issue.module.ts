import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from '../issue/entities/issue.entity';
import { Tenant } from '../tenant/tenant.entity';
import { TenantIssue } from './entities/tenant-issue.entity';
import { TenantIssueQueryService } from './services/tenant-issue.query.service';
import { TenantIssueService } from './services/tenant-issue.service';
import { TenantIssueController } from './tenant-issue.controller';

@Module({
	imports: [TypeOrmModule.forFeature([TenantIssue, Tenant, Issue])],
	controllers: [TenantIssueController],
	providers: [TenantIssueService, TenantIssueQueryService],
	exports: [TenantIssueService, TenantIssueQueryService],
})
export class TenantIssueModule {}
