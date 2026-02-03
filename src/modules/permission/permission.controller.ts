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
import {
	SystemAdminOnly,
	TenantOwnerOrAdminOnly,
} from '../auth/decorators/auth.decorator';
import {
	PermissionMessageCodeSuccess,
	PermissionMessageSuccess,
} from './constants/permission.constant';
import {
	BulkCreatePermissionDto,
	BulkDeletePermissionDto,
	CreatePermissionDto,
	QueryGetListPermissionDto,
	UpdatePermissionDto,
} from './dto/permission.dto';
import { PermissionService } from './services/permission.service';

@Controller('permission')
export class PermissionController {
	constructor(private readonly permissionService: PermissionService) {}

	@SystemAdminOnly()
	@Post()
	async create(@Body() data: CreatePermissionDto, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.permissionService.create(data, userId);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Post('bulk')
	async bulkCreate(
		@Body() data: BulkCreatePermissionDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.permissionService.bulkCreate(data, userId);

		return new ResponseSuccess({ ...result });
	}

	@TenantOwnerOrAdminOnly()
	@Get()
	async getList(@Query() query: QueryGetListPermissionDto) {
		const result = await this.permissionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Get('simple')
	async getListSimple() {
		const result = await this.permissionService.getAll();
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.permissionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdatePermissionDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;
		const result = await this.permissionService.update(id, data, userId);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Post('bulk-delete')
	async bulkDelete(@Body() data: BulkDeletePermissionDto) {
		const result = await this.permissionService.bulkDelete(data);
		return new ResponseSuccess({ ...result });
	}

	@SystemAdminOnly()
	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.permissionService.delete(id);
		return new ResponseSuccess({
			message: PermissionMessageSuccess.DELETE,
			messageCode: PermissionMessageCodeSuccess.DELETE,
		});
	}
}
