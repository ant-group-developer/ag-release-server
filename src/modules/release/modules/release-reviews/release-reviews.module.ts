import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseModule } from '../../release.module';
import { ReleaseErrorsModule } from '../release-errors/release-errors.module';
import { ReleaseReviewController } from './controllers/release-review.controller';
import { ReleaseReview } from './entities/release-review.entity';
import { ReleaseReviewService } from './services/release-review.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([ReleaseReview]),
		forwardRef(() => ReleaseErrorsModule),
		forwardRef(() => ReleaseModule),
	],
	controllers: [ReleaseReviewController],
	providers: [ReleaseReviewService],
	exports: [ReleaseReviewService],
})
export class ReleaseReviewsModule {}
