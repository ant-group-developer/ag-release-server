import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsCategory } from '../news-category/entities/news-category.entity';
import { NewsPost } from './entities/news-post.entity';
import { NewsPostController } from './news-post.controller';
import { NewsPostQueryService } from './services/news-post.query.service';
import { NewsPostService } from './services/news-post.service';

@Module({
	imports: [TypeOrmModule.forFeature([NewsPost, NewsCategory])],
	providers: [NewsPostService, NewsPostQueryService],
	controllers: [NewsPostController],
	exports: [NewsPostService, NewsPostQueryService],
})
export class NewsPostModule {}
