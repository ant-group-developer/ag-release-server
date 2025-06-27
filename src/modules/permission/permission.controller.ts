import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreatePermissionDto,
	QueryGetListPermissionDto,
	UpdatePermissionDto,
} from './dto/permission.dto';
import { Permission } from './entities/permission.entity';
import { PermissionService } from './permission.service';

@Controller('permission')
export class PermissionController {
	constructor(private readonly PermissionService: PermissionService) {}

	@Post()
	async create(
		@Body() createPermissionDto: CreatePermissionDto,
	): Promise<ResponseSuccess<Permission>> {
		const result = await this.PermissionService.create(createPermissionDto);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<Permission>> {
		const result = await this.PermissionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListPermissionDto,
	): Promise<ResponseSuccess<PageDto<Permission>>> {
		const result = await this.PermissionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updatePermissionDto: UpdatePermissionDto,
	): Promise<Permission> {
		return await this.PermissionService.update(id, updatePermissionDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.PermissionService.remove(id);
	}
}
