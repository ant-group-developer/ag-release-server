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
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';
import { NewsPostResponse } from './constants/news-post.constant';
import {
	CreateNewsPostDto,
	QueryGetListNewsPostDto,
	UpdateNewsPostDto,
} from './dto/news-post.dto';
import { NewsPostService } from './services/news-post.service';

@Controller('news-posts')
export class NewsPostController {
	constructor(private readonly newsPostService: NewsPostService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreateNewsPostDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.newsPostService.create(data, userId);
		return new ResponseSuccess(NewsPostResponse.CREATE_SUCCESS(result));
	}

	@Get()
	async getList(@Query() query: QueryGetListNewsPostDto) {
		const result = await this.newsPostService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('public')
	async getListPublic(@Query() query: QueryGetListNewsPostDto) {
		const result = await this.newsPostService.getListPublic(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.newsPostService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
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

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsPostService.delete(id);
		return new ResponseSuccess(NewsPostResponse.DELETE_SUCCESS);
	}
}
