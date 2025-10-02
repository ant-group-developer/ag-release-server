import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Language } from '../language/entities/language.entity';
import { NewsCategory } from '../news-category/entities/news-category.entity';
import { NewsPostController } from './controllers/news-post.controller';
import { NewsPostTranslationController } from './controllers/news-post.translation.controller';
import { NewsPostTranslation } from './entities/news-post-translation.entity';
import { NewsPost } from './entities/news-post.entity';
import { NewsPostTranslationService } from './services/news-post-translation.service';
import { NewsPostQueryService } from './services/news-post.query.service';
import { NewsPostService } from './services/news-post.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			NewsPost,
			NewsCategory,
			NewsPostTranslation,
			Language,
		]),
	],
	providers: [
		NewsPostService,
		NewsPostQueryService,
		NewsPostTranslationService,
	],
	controllers: [NewsPostTranslationController, NewsPostController],
	exports: [NewsPostService, NewsPostQueryService],
})
export class NewsPostModule {}
