import {
	Body,
	Controller,
	Get,
	NotFoundException,
	Param,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateUserDto } from './dto/user.dto';
import { UserService } from './user.service';

@ApiTags('User')
@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post()
	@ApiOperation({ summary: 'Create a new user' })
	@ApiResponse({
		status: 201,
		description: 'User successfully created',
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid input data',
	})
	async createUser(@Body() data: CreateUserDto) {
		await this.userService.createUser(data);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a user by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved user',
	})
	@ApiResponse({
		status: 404,
		description: 'User not found',
	})
	@ApiParam({ name: 'id', type: String, description: 'The ID of the user' })
	async findOne(@Param('id') id: string) {
		const user = await this.userService.findUserById(id);
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of all users' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved list of users',
	})
	@ApiResponse({
		status: 404,
		description: 'No users found',
	})
	async getList() {
		const users = await this.userService.getList();
		if (!users || users.length === 0) {
			throw new NotFoundException('No users found');
		}
		return users;
	}
}
