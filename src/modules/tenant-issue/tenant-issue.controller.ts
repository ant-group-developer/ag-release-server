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
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { SystemAdminOnly } from '../auth/decorators/auth.decorator';

import {
	TenantIssueMessageCodeSuccess,
	TenantIssueMessageSuccess,
} from './constants/tenant-issue.constant';
import {
	CreateTenantIssueDto,
	QueryGetListTenantIssueDto,
	UpdateTenantIssueDto,
} from './dto/tenant-issue.dto';
import { TenantIssueService } from './services/tenant-issue.service';

@Controller('tenant-issues')
export class TenantIssueController {
	constructor(private readonly tenantIssueService: TenantIssueService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreateTenantIssueDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.tenantIssueService.create(data, userId);
		return new ResponseSuccess({
			data: result,
			message: TenantIssueMessageSuccess.CREATE,
			messageCode: TenantIssueMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	async getList(@Query() query: QueryGetListTenantIssueDto) {
		const result = await this.tenantIssueService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.tenantIssueService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateTenantIssueDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.tenantIssueService.update(id, data, userId);
		return new ResponseSuccess({
			data: result,
			message: TenantIssueMessageSuccess.UPDATE,
			messageCode: TenantIssueMessageCodeSuccess.UPDATE,
		});
	}

	@SystemAdminOnly()
	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.tenantIssueService.delete(id);
		return new ResponseSuccess({
			message: TenantIssueMessageSuccess.DELETE,
			messageCode: TenantIssueMessageCodeSuccess.DELETE,
		});
	}
}
