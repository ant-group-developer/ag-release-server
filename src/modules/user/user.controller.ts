import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';
import { CreateUserDto, GetListUserDto, UpdateUserDto } from './dto/user.dto';
import { User } from './entities/user.entity';
import { UserSyncService } from './services/user-sync.service';
import { UserService } from './services/user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly userSyncService: UserSyncService,
	) {}

	@Post()
	async create(
		@Body() payload: CreateUserDto,
	): Promise<ResponseSuccess<User>> {
		const result = await this.userService.create(payload);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccess<User>> {
		const result = await this.userService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(
		@Query() query: GetListUserDto,
	): Promise<ResponseSuccess<PageDto<User>>> {
		const result = await this.userService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@ApiOperation({ summary: 'Sync user data from Auth0' })
	@Post('sync-data')
	async syncUserFromAuth0() {
		await this.userSyncService.syncUserFromAuth0();
		return new ResponseSuccess({
			message: 'Sync user data from Auth0 successfully',
		});
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() payload: UpdateUserDto,
	): Promise<ResponseSuccess<User>> {
		const result = await this.userService.update(id, payload);
		return new ResponseSuccess({ data: result });
	}
}
