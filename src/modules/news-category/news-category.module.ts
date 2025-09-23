import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsCategory } from './entities/news-category.entity';
import { NewsCategoryController } from './news-category.controller';
import { NewsCategoryQueryService } from './services/news-category.query.service';
import { NewsCategoryService } from './services/news-category.service';

@Module({
	imports: [TypeOrmModule.forFeature([NewsCategory])],
	providers: [NewsCategoryService, NewsCategoryQueryService],
	controllers: [NewsCategoryController],
	exports: [NewsCategoryService, NewsCategoryQueryService],
})
export class NewsCategoryModule {}
