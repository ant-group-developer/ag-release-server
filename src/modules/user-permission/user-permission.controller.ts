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
	CreateUserPermissionDto,
	QueryGetListUserPermissionDto,
	UpdateUserPermissionDto,
} from './dto/user-permission.dto';
import { UserPermission } from './entities/user-permission.entity';
import { UserPermissionService } from './services/user-permission.service';

@Controller('user-permission')
export class UserPermissionController {
	constructor(
		private readonly userPermissionService: UserPermissionService,
	) {}

	@Post()
	async create(
		@Body() createUserPermissionDto: CreateUserPermissionDto,
	): Promise<ResponseSuccess<UserPermission>> {
		const result = await this.userPermissionService.create(
			createUserPermissionDto,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<UserPermission>> {
		const result = await this.userPermissionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListUserPermissionDto,
	): Promise<ResponseSuccess<PageDto<UserPermission>>> {
		const result = await this.userPermissionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateUserPermissionDto: UpdateUserPermissionDto,
	): Promise<UserPermission> {
		return await this.userPermissionService.update(
			id,
			updateUserPermissionDto,
		);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.userPermissionService.remove(id);
	}
}
