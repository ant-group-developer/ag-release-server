import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseReviewsModule } from '../release-reviews/release-reviews.module';
import { ReleaseErrorController } from './controllers/release-error.controller';
import { ReleaseError } from './entities/release-error.entity';
import { ReleaseErrorService } from './services/release-error.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseError]),
		forwardRef(() => ReleaseReviewsModule),
	],
	controllers: [ReleaseErrorController],
	providers: [ReleaseErrorService],
	exports: [ReleaseErrorService],
})
export class ReleaseErrorsModule {}
