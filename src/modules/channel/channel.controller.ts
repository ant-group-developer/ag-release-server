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
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { ChannelService } from './channel.service';
import {
	CreateChannelDto,
	QueryGetListChannelDto,
	UpdateChannelDto,
} from './dto/channel.dto';

@ApiTags('Channels')
@Controller('channels')
export class ChannelController {
	constructor(private readonly channelService: ChannelService) {}

	@Post()
	@ApiOperation({ summary: 'Create channel' })
	@ApiBody({ type: CreateChannelDto })
	async create(@Body() dto: CreateChannelDto) {
		const result = await this.channelService.create(dto);
		return new ResponseSuccess({
			message: 'Channel is processing',
			messageCode: 'common.processing',
			data: result,
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get channels' })
	async getList(@Query() query: QueryGetListChannelDto) {
		const result = await this.channelService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	@ApiOperation({ summary: 'Get simple channel list' })
	async getListSimple() {
		const result = await this.channelService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get channel by ID' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.channelService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateChannelDto })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateChannelDto,
	) {
		const result = await this.channelService.update(id, dto);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.channelService.remove(id);
		return new ResponseSuccess({ data: result });
	}
}
