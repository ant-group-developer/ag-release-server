import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
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
import { NewsPostResponseSuccess } from '../constants/news-post.constant';
import { GetListNewsPostTranslations } from '../dto/news-post-translation.dto';
import {
	AddTranslationNewsPostDto,
	CreateNewsPostDto,
	QueryGetListNewsPostDto,
	UpdateNewsPostDto,
} from '../dto/news-post.dto';
import { NewsPostService } from '../services/news-post.service';

@Controller('news-posts')
export class NewsPostController {
	private readonly responseSuccess = NewsPostResponseSuccess;

	constructor(private readonly newsPostService: NewsPostService) {}

	@Post()
	async create(@Body() data: CreateNewsPostDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.newsPostService.handleCreate(data, userId);
		return new ResponseSuccess(this.responseSuccess.CREATE_SUCCESS(result));
	}

	@Get('keywords')
	async sidebarKeywords() {
		const data = await this.newsPostService.getKeywords();
		return new ResponseSuccess({ data });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListNewsPostDto,
		@Headers('locale') locale?: string,
	) {
		const result = await this.newsPostService.getList(query, locale);
		return new ResponseSuccess({ data: result });
	}

	@PublicRoute()
	@Get('public')
	async getListPublic(
		@Query() query: QueryGetListNewsPostDto,
		@Headers('locale') locale?: string,
	) {
		const result = await this.newsPostService.getListPublic(query, locale);
		return new ResponseSuccess({ data: result });
	}

	@PublicRoute()
	@Get('public/:slug')
	async findOnePublic(
		@Param('slug') slug: string,
		@Headers('locale') locale?: string,
	) {
		const result = await this.newsPostService.findOnePublic(slug, locale);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOneNewsPostAssigneedId(
		@Param('id', ParseUUIDPipe) id: string,
		@Headers('locale') locale?: string,
	) {
		const result = await this.newsPostService.findOneNewsPostAssigneedId(
			id,
			locale,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id/translations')
	async listNewsPostLanguage(
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: GetListNewsPostTranslations,
	) {
		query.newsPostId = id;
		const result = await this.newsPostService.listNewsPostLanguage(query);
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
		const result = await this.newsPostService.handleUpdate(
			id,
			data,
			userId,
		);
		return new ResponseSuccess(this.responseSuccess.UPDATE_SUCCESS(result));
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
		return new ResponseSuccess(this.responseSuccess.UPDATE_SUCCESS(result));
	}

	// @Put(':id/update-translation')
	// async updateTranslation(
	// 	@Body() data: UpdateTranslation,
	// 	@Req() req: Request,
	// ) {
	// 	data.userId = req.user!.sub;

	// 	const result = await this.newsPostService.updateTranslation(data);
	// 	return new ResponseSuccess(
	// 		this.responseSuccess.TRANSLATION_SUCCESS.UPDATE_SUCCESS(result),
	// 	);
	// }

	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsPostService.delete(id);
		return new ResponseSuccess(this.responseSuccess.DELETE_SUCCESS);
	}

	@Delete(':id/delete-translation/:translationId')
	async deleteTranslation(
		@Param('translationId', ParseUUIDPipe) translationId: string,
	) {
		await this.newsPostService.deleteTranslation(translationId);
		return new ResponseSuccess(
			this.responseSuccess.TRANSLATION_SUCCESS.DELETE_SUCCESS,
		);
	}
}
