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
	CreateUserDto,
	QueryGetListUserDto,
	UpdateUserDto,
} from './dto/user.dto';
import { User } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('User')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post()
	async create(
		@Body() createUserDto: CreateUserDto,
	): Promise<ResponseSuccessDto<User>> {
		const result = await this.userService.create(createUserDto);
		return new ResponseSuccessDto({ data: result });
	}

	@Get(':id')
	async findOne(@Param('id') id: string): Promise<ResponseSuccessDto<User>> {
		const result = await this.userService.findOne(id);
		return new ResponseSuccessDto({ data: result });
	}

	@Get()
	async getList(
		@Query() query: QueryGetListUserDto,
	): Promise<ResponseSuccessDto<PageDto<User>>> {
		const result = await this.userService.getList(query);
		return new ResponseSuccessDto({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id') id: string,
		@Body() updateUserDto: UpdateUserDto,
	): Promise<User> {
		return await this.userService.update(id, updateUserDto);
	}

	@Delete(':id')
	async remove(@Param('id') id: string): Promise<void> {
		return await this.userService.remove(id);
	}
}
