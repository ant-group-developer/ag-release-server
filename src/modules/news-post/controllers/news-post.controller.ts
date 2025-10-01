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
import { PublicRoute } from '../../auth/decorators/auth.decorator';
import { NewsPostResponse } from '../constants/news-post.constant';
import {
	AddTranslationNewsPostDto,
	CreateNewsPostDto,
	QueryGetListNewsPostDto,
	UpdateNewsPostDto,
	UpdateTranslation,
} from '../dto/news-post.dto';
import { NewsPostService } from '../services/news-post.service';

@Controller('news-posts')
export class NewsPostController {
	constructor(private readonly newsPostService: NewsPostService) {}

	@Post()
	async create(@Body() data: CreateNewsPostDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.newsPostService.handleCreate(data, userId);
		return new ResponseSuccess(NewsPostResponse.CREATE_SUCCESS(result));
	}

	@Get()
	async getList(@Query() query: QueryGetListNewsPostDto) {
		const result = await this.newsPostService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('keywords')
	async sidebarKeywords() {
		const data = await this.newsPostService.getKeywords();
		return new ResponseSuccess({ data });
	}

	@PublicRoute()
	@Get('public')
	async getListPublic(@Query() query: QueryGetListNewsPostDto) {
		const result = await this.newsPostService.getListPublic(query);
		return new ResponseSuccess({ data: result });
	}

	@PublicRoute()
	@Get('public/:slug')
	async findOnePublic(@Param('slug') slug: string) {
		const result = await this.newsPostService.findOnePublic(slug);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.newsPostService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/translations')
	async listNewsPostLanguage(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.newsPostService.listNewsPostLanguage(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/translations/default')
	async detailTranslationDefault(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.newsPostService.detailTranslationDefault(id);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/translations/:translationId')
	async detailTranslation(
		@Param('translationId', ParseUUIDPipe) translationId: string,
	) {
		const result =
			await this.newsPostService.detailTranslation(translationId);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateNewsPostDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.newsPostService.update(id, data, userId);
		return new ResponseSuccess(NewsPostResponse.UPDATE_SUCCESS(result));
	}

	@Put(':id/add-translation')
	async addTranslation(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: AddTranslationNewsPostDto,
		@Req() req: Request,
	) {
		data.userId = req.user!.sub;

		const result = await this.newsPostService.addTranslationNewsPost(
			id,
			data,
		);
		return new ResponseSuccess(NewsPostResponse.UPDATE_SUCCESS(result));
	}

	@Put(':id/update-translation')
	async updateTranslation(
		@Body() data: UpdateTranslation,
		@Req() req: Request,
	) {
		data.userId = req.user!.sub;

		const result = await this.newsPostService.updateTranslation(data);
		return new ResponseSuccess(NewsPostResponse.UPDATE_SUCCESS(result));
	}

	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsPostService.delete(id);
		return new ResponseSuccess(NewsPostResponse.DELETE_SUCCESS);
	}

	@Delete(':id/delete-translation/:translationId')
	async deleteTranslation(
		@Param('translationId', ParseUUIDPipe) translationId: string,
	) {
		await this.newsPostService.deleteTranslation(translationId);
		return new ResponseSuccess(NewsPostResponse.DELETE_SUCCESS);
	}
}
