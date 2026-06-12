import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	PublicRoute,
	SystemAdminOnly,
} from '../auth/decorators/auth.decorator';
import { VevoChannelCallbackDto } from '../partners-api/vevo/dtos/vevo.dto';
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

	@SystemAdminOnly()
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

	@PublicRoute()
	@Post('vevo/callback')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Receive a completed Vevo channel request' })
	@ApiBody({ type: VevoChannelCallbackDto })
	@ApiResponse({ status: 200, description: 'Callback received' })
	async handleVevoCallback(@Body() payload: VevoChannelCallbackDto) {
		const result = await this.channelService.handleVevoCallback(payload);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get channels' })
	async getList(@Query() query: QueryGetListChannelDto, @Req() req: Request) {
		const tenantId = req.user!.tenantId;
		const result = await this.channelService.getList(query, tenantId);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	@ApiOperation({ summary: 'Get simple channel list' })
	async getListSimple(
		@Query() query: QueryGetListChannelDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const result = await this.channelService.getListSimple(query, tenantId);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get channel by ID' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
		const result = await this.channelService.findOne(
			id,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateChannelDto })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateChannelDto,
		@Req() req: Request,
	) {
		const result = await this.channelService.update(
			id,
			dto,
			req.user!.tenantId,
			req.user!.sub,
		);
		return new ResponseSuccess({ data: result });
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
		const result = await this.channelService.remove(id, req.user!.tenantId);
		return new ResponseSuccess({ data: result });
	}
}
