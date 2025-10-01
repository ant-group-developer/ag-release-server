import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsCategory } from '../news-category/entities/news-category.entity';
import { NewsPostController } from './controllers/news-post.controller';
import { NewsPostLanguageController } from './controllers/news-post.translation.controller';
import { NewsPostTranslation } from './entities/news-post-translation.entity';
import { NewsPost } from './entities/news-post.entity';
import { NewsPostTranslationService } from './services/news-post-translation.service';
import { NewsPostQueryService } from './services/news-post.query.service';
import { NewsPostService } from './services/news-post.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([NewsPost, NewsCategory, NewsPostTranslation]),
	],
	providers: [
		NewsPostService,
		NewsPostQueryService,
		NewsPostTranslationService,
	],
	controllers: [NewsPostController, NewsPostLanguageController],
	exports: [NewsPostService, NewsPostQueryService],
})
export class NewsPostModule {}
