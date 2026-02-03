import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssueLevel } from '../issue-level/entities/issue-level.entity';
import { Issue } from './entities/issue.entity';
import { IssueController } from './issue.controller';
import { IssueQueryService } from './services/issue.query.service';
import { IssueService } from './services/issue.service';

@Module({
	imports: [TypeOrmModule.forFeature([Issue, IssueLevel])],
	providers: [IssueService, IssueQueryService],
	controllers: [IssueController],
	exports: [IssueService, IssueQueryService],
})
export class IssueModule {}
