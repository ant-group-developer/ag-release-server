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
	Req,
	UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from '../../auth/decorators/auth.decorator';

import {
	AssignUsersToChannelDto,
	CreateChannelDto,
	QueryGetListChannelDto,
	UpdateChannelDto,
} from '../dto/channel.dto';
import { ChannelStatus } from '../enum/channel.enum';
import { ChannelAccessGuard } from '../guards/channel-access.guard';
import { ChannelService } from '../services/channel.service';

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
			message:
				result.status === ChannelStatus.PROCESSING
					? 'Channel is processing'
					: 'Success',
			messageCode:
				result.status === ChannelStatus.PROCESSING
					? 'common.processing'
					: 'common.success',
			data: result,
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get channels' })
	async getList(@Query() query: QueryGetListChannelDto, @Req() req: Request) {
		const tenantId = req.user!.tenantId;
		const userId = req.user!.sub || req.user!.id;
		const result = await this.channelService.getList(
			query,
			tenantId,
			userId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get('my-channels')
	@ApiOperation({ summary: 'Get channels assigned to current user' })
	async getMyChannels(@Req() req: Request) {
		const tenantId = req.user!.tenantId;
		const userId = req.user!.sub || req.user!.id;
		const result = await this.channelService.getUserChannels(
			userId,
			tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get('users/:userId')
	@ApiOperation({ summary: 'Get channels assigned to a specific user by ID' })
	@ApiParam({ name: 'userId', format: 'uuid' })
	async getUserChannels(
		@Param('userId', ParseUUIDPipe) userId: string,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const result = await this.channelService.getUserChannels(
			userId,
			tenantId,
		);
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

	@Get('video-options')
	@ApiOperation({ summary: 'Get channels for creating a video' })
	async getListForVideo(
		@Query() query: QueryGetListChannelDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub || req.user!.id;
		const result = await this.channelService.getListChannelOnlyActorTenant(
			query,
			req.user!.tenantId,
			userId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@UseGuards(ChannelAccessGuard)
	@ApiOperation({ summary: 'Get channel by ID' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
		const result = await this.channelService.findOne(
			id,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/users')
	@ApiOperation({ summary: 'Assign users to a channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: AssignUsersToChannelDto })
	async assignUsers(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: AssignUsersToChannelDto,
		@Req() req: Request,
	) {
		const creatorId = req.user!.sub || req.user!.id;
		await this.channelService.assignUsersToChannel(
			id,
			dto.userIds,
			req.user!.tenantId,
			creatorId,
		);
		return new ResponseSuccess({});
	}

	@Get(':id/users')
	@UseGuards(ChannelAccessGuard)
	@ApiOperation({ summary: 'Get users assigned to a channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async getUsersInChannel(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		const result = await this.channelService.getUsersInChannel(
			id,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Delete('member/:id')
	@ApiOperation({ summary: 'Remove a user from a channel' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async removeUserFromChannel(
		@Param('id', ParseUUIDPipe) id: string,
		@Req() req: Request,
	) {
		await this.channelService.removeUserFromChannel(id, req.user!.tenantId);
		return new ResponseSuccess();
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
