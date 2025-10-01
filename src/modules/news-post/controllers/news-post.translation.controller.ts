import {
	Body,
	Controller,
	Delete,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { NewsPostTranslationResponse } from '../constants/news-post-translation.constant';
import { CreateNewsPostTranslationDto } from '../dto/news-post-translation.dto';
import { NewsPostTranslationService } from '../services/news-post-translation.service';

@Controller('news-posts-language')
export class NewsPostLanguageController {
	constructor(
		private readonly newsPostTranslationService: NewsPostTranslationService,
	) {}

	@Post()
	async create(
		@Body() data: CreateNewsPostTranslationDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		data.userId = userId;
		const result = await this.newsPostTranslationService.create(data);
		return new ResponseSuccess(
			NewsPostTranslationResponse.CREATE_SUCCESS(result),
		);
	}

	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsPostTranslationService.delete(id);
		return new ResponseSuccess(NewsPostTranslationResponse.DELETE_SUCCESS);
	}
}
