import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReleaseError } from '../release-errors/entities/release-error.entity';
import { ReleaseReviewController } from './controllers/release-review.controller';
import { ReleaseReview } from './entities/release-review.entity';
import { ReleaseReviewService } from './services/release-review.service';

@Module({
	imports: [TypeOrmModule.forFeature([ReleaseReview, ReleaseError])],
	controllers: [ReleaseReviewController],
	providers: [ReleaseReviewService],
	exports: [ReleaseReviewService],
})
export class ReleaseReviewsModule {}
