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
	constructor(private readonly PermissionService: PermissionService) {}

	@Post()
	async create(@Body() data: CreatePermissionDto) {
		const result = await this.PermissionService.create(data);
		return new ResponseSuccess({ data: result });
	}

	@Post('bulk')
	async bulkCreate(@Body() data: BulkCreatePermissionDto) {
		const result = await this.PermissionService.bulkCreate(data);

		return new ResponseSuccess({ ...result });
	}

	@Get(':id')
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.PermissionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(@Query() query: QueryGetListPermissionDto) {
		const result = await this.PermissionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdatePermissionDto,
	) {
		const result = await this.PermissionService.update(id, data);
		return new ResponseSuccess({ data: result });
	}

	@Delete('bulk')
	async bulkDelete(@Body() data: BulkDeletePermissionDto) {
		const result = await this.PermissionService.bulkDelete(data);
		return new ResponseSuccess({ ...result });
	}

	@Delete(':id')
	async delete(@Param('id', ParseUUIDPipe) id: string) {
		await this.PermissionService.delete(id);
		return new ResponseSuccess({
			message: PermissionMessageSuccess.DELETE,
			messageCode: PermissionMessageCodeSuccess.DELETE,
		});
	}
}
