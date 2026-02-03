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
import { IssueLevelResponse } from './constant/issue-level.constant';
import {
	BulkUpdateIssueLevel,
	CreateIssueLevelDto,
	QueryGetListIssueLevelDto,
	UpdateIssueLevelDto,
} from './dto/issue-level.dto';
import { IssueLevel } from './entities/issue-level.entity';
import { IssueLevelService } from './services/issue-level.service';

@Controller('issue-levels')
export class IssueLevelController {
	constructor(private readonly issueLevelService: IssueLevelService) {}

	@SystemAdminOnly()
	@Post()
	async create(
		@Body() data: CreateIssueLevelDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<IssueLevel>> {
		const userId = req.user!.sub;
		const result = await this.issueLevelService.create(data, userId);
		return new ResponseSuccess(IssueLevelResponse.CREATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Get()
	async getList(@Query() query: QueryGetListIssueLevelDto) {
		const result = await this.issueLevelService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.issueLevelService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<IssueLevel>> {
		const result = await this.issueLevelService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put('bulk')
	async bulkUpdate(
		@Body() data: BulkUpdateIssueLevel,
	): Promise<ResponseSuccess<IssueLevel[]>> {
		const result = await this.issueLevelService.bulkUpdate(data);
		return new ResponseSuccess(
			IssueLevelResponse.UPDATE_ORDER_SUCCESS(result),
		);
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateIssueLevelDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<IssueLevel>> {
		const userId = req.user!.sub;
		const result = await this.issueLevelService.update(id, data, userId);
		return new ResponseSuccess(IssueLevelResponse.UPDATE_SUCCESS(result));
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.issueLevelService.delete(id);
		return new ResponseSuccess(IssueLevelResponse.DELETE_SUCCESS);
	}
}
