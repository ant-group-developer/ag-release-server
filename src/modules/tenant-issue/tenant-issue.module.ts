import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantIssue } from './entities/tenant-issue.entity';

@Module({
	imports: [TypeOrmModule.forFeature([TenantIssue])],
})
export class TenantIssueModule {}
