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
	CreateActionDto,
	QueryGetListActionDto,
	UpdateActionDto,
} from './dtos/action.dto';
import { Action } from './entities/action.entity';
import { ActionService } from './services/action.service';

@Controller('actions')
export class ActionController {
	constructor(private readonly actionService: ActionService) {}

	@Post()
	async create(
		@Body() data: CreateActionDto,
	): Promise<ResponseSuccess<Action>> {
		const result = await this.actionService.create(data);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<Action>> {
		const result = await this.actionService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getList(@Query() query: QueryGetListActionDto) {
		const result = await this.actionService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateActionDto,
	): Promise<ResponseSuccess<Action>> {
		const result = await this.actionService.update(id, data);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	async remove(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.actionService.delete(id);
		return new ResponseSuccess({ messageCode: 'Action deleted' });
	}
}
