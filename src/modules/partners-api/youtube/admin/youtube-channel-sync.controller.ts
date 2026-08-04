import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	QueryYoutubeChannelSyncLogsDto,
	QueryYoutubeChannelSyncRunsDto,
	SyncYoutubeChannelsDto,
} from '../dto/youtube-channel-sync.dto';
import { YoutubeChannelSyncService } from '../services/youtube-channel-sync.service';

@ApiTags('Admin - YouTube Channel Sync')
@Controller('admin/youtube-channel-sync-runs')
@SystemAdminOnly()
export class YoutubeChannelSyncController {
	constructor(private readonly syncService: YoutubeChannelSyncService) {}

	@Post()
	@ApiOperation({
		summary: 'Sync all channel names and thumbnails from YouTube',
		description:
			'force=false only fills NULL local fields. force=true overwrites local values when Google returns a different value.',
	})
	async sync(@Body() dto: SyncYoutubeChannelsDto, @Req() req: Request) {
		const actorId = req.user!.sub || req.user!.id;
		const data = await this.syncService.syncAll(dto, actorId);
		return new ResponseSuccess({ data });
	}

	@Get()
	@ApiOperation({
		summary:
			'List YouTube channel sync runs with their overview statistics',
	})
	async listRuns(@Query() query: QueryYoutubeChannelSyncRunsDto) {
		const data = await this.syncService.listRuns(query);
		return new ResponseSuccess({ data });
	}

	@Get('logs')
	@ApiOperation({
		summary: 'List per-field YouTube channel sync audit logs',
		description:
			'Each log includes its linked channel object (or null when the channel was deleted).',
	})
	async listLogs(@Query() query: QueryYoutubeChannelSyncLogsDto) {
		const data = await this.syncService.listLogs(query);
		return new ResponseSuccess({ data });
	}
}
