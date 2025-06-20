import {
	Body,
	Controller,
	Get,
	NotFoundException,
	Param,
	Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	@Post()
	async createUser(@Body() data: CreateUserDto) {
		await this.userService.createUser(data);
	}

	@Get(':id')
	async findOne(@Param('id') id: string) {
		const user = await this.userService.findUserById(id);
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}

	@Get()
	async getList() {
		const user = await this.userService.getList();
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}
}
