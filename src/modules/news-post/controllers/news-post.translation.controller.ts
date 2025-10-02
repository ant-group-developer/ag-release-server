import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { NewsPostTranslationResponseSuccess } from '../constants/news-post-translation.constant';
import {
	CreateNewsPostTranslationDto,
	GetListNewsPostTranslations,
	UpdateNewsPostTranslationDto,
} from '../dto/news-post-translation.dto';
import { NewsPostTranslationService } from '../services/news-post-translation.service';

@Controller('news-posts/translations')
export class NewsPostTranslationController {
	private readonly responseSuccess = NewsPostTranslationResponseSuccess;

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
		return new ResponseSuccess(this.responseSuccess.CREATE_SUCCESS(result));
	}

	@Get()
	async getList(@Query() query: GetListNewsPostTranslations) {
		const data = await this.newsPostTranslationService.getList(query);
		return new ResponseSuccess({ data });
	}

	@Get(':id')
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.newsPostTranslationService.findOne(id);
		return new ResponseSuccess({ data });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateNewsPostTranslationDto,
		@Req() req: Request,
	) {
		data.userId = req.user!.sub;

		const result = await this.newsPostTranslationService.update(id, data);
		return new ResponseSuccess(this.responseSuccess.UPDATE_SUCCESS(result));
	}

	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsPostTranslationService.delete(id);
		return new ResponseSuccess(this.responseSuccess.DELETE_SUCCESS);
	}
}
