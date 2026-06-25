import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseErrorController } from './controllers/release-error.controller';
import { ReleaseError } from './entities/release-error.entity';
import { ReleaseErrorService } from './services/release-error.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseError])],
	controllers: [ReleaseErrorController],
	providers: [ReleaseErrorService],
	exports: [ReleaseErrorService],
})
export class ReleaseErrorsModule {}
