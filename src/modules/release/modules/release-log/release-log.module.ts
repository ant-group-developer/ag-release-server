import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseLogController } from './controllers/release-log.controller';
import { ReleaseLog } from './entities/release-log.entity';
import { ReleaseLogService } from './services/release-log.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseLog])],
	controllers: [ReleaseLogController],
	providers: [ReleaseLogService],
	exports: [ReleaseLogService],
})
export class ReleaseLogModule {}
