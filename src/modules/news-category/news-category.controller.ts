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
import { NewsCategoryResponse } from './constants/news-category.constant';
import {
	BulkUpdateNewsCategory,
	CreateNewsCategoryDto,
	QueryGetListNewsCategoryDto,
	UpdateNewsCategoryDto,
} from './dto/news-category.dto';
import { NewsCategory } from './entities/news-category.entity';
import { NewsCategoryService } from './services/news-category.service';

@Controller('news-categories')
export class NewsCategoryController {
	constructor(private readonly newsCategoryService: NewsCategoryService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreateNewsCategoryDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.newsCategoryService.create(data, userId);
		return new ResponseSuccess(NewsCategoryResponse.CREATE_SUCCESS(result));
	}

	@Get()
	async getList(@Query() query: QueryGetListNewsCategoryDto) {
		const result = await this.newsCategoryService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('tree')
	async getTree() {
		const result = await this.newsCategoryService.getTree();
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.newsCategoryService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.newsCategoryService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put('bulk')
	async bulkUpdate(
		@Body() data: BulkUpdateNewsCategory,
	): Promise<ResponseSuccess<NewsCategory[]>> {
		const result = await this.newsCategoryService.bulkUpdate(data);
		return new ResponseSuccess(
			NewsCategoryResponse.UPDATE_ORDER_SUCCESS(result),
		);
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateNewsCategoryDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.newsCategoryService.update(id, data, userId);
		return new ResponseSuccess(NewsCategoryResponse.UPDATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.newsCategoryService.delete(id);
		return new ResponseSuccess(NewsCategoryResponse.DELETE_SUCCESS);
	}
}
