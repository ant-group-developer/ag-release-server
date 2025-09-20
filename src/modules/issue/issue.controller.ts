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
import { IssueResponse } from './constants/issue.constant';
import {
	CreateIssueDto,
	QueryGetListIssueDto,
	UpdateIssueDto,
} from './dto/issue.dto';
import { IssueService } from './services/issue.service';

@Controller('issues')
export class IssueController {
	constructor(private readonly issueService: IssueService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreateIssueDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.issueService.create(data, userId);
		return new ResponseSuccess(IssueResponse.CREATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Get()
	async getList(@Query() query: QueryGetListIssueDto) {
		const result = await this.issueService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.issueService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.issueService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Get(':id/simple')
	async findOneSimple(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.issueService.findOneSimple(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateIssueDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.issueService.update(id, data, userId);
		return new ResponseSuccess(IssueResponse.UPDATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.issueService.delete(id);
		return new ResponseSuccess(IssueResponse.DELETE_SUCCESS);
	}
}
