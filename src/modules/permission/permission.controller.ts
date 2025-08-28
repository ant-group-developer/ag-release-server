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
} from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
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
	async create(@Body() data: CreatePermissionDto) {
		const result = await this.permissionService.create(data);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Post('bulk')
	async bulkCreate(@Body() data: BulkCreatePermissionDto) {
		const result = await this.permissionService.bulkCreate(data);

		return new ResponseSuccess({ ...result });
	}

	@TenantOwnerOrAdminOnly()
	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.permissionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@TenantOwnerOrAdminOnly()
	@Get()
	async getList(@Query() query: QueryGetListPermissionDto) {
		const result = await this.permissionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@SystemAdminOnly()
	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdatePermissionDto,
	) {
		const result = await this.permissionService.update(id, data);
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
