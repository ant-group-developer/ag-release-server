import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from './entities/issue.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Issue])],
})
export class IssueModule {}
