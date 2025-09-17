import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssueLevel } from './entities/issue-level.entity';
import { IssueLevelController } from './issue-level.controller';
import { IssueLevelQueryService } from './services/issue-level.query.service';
import { IssueLevelService } from './services/issue-level.service';

@Module({
	imports: [TypeOrmModule.forFeature([IssueLevel])],
	controllers: [IssueLevelController],
	providers: [IssueLevelService, IssueLevelQueryService],
	exports: [IssueLevelService, IssueLevelQueryService],
})
export class IssueLevelModule {}
