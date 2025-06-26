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
import { PageDto, ResponseSuccessDto } from 'src/common/dtos/response.dto';
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
	): Promise<ResponseSuccessDto<UserPermission>> {
		const result = await this.userPermissionService.create(
			createUserPermissionDto,
		);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccessDto<UserPermission>> {
		const result = await this.userPermissionService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListUserPermissionDto,
	): Promise<ResponseSuccessDto<PageDto<UserPermission>>> {
		const result = await this.userPermissionService.getList(query);
		return new ResponseSuccessDto({ data: result });
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
