import {
	Body,
	Controller,
	Get,
	Param,
	ParseIntPipe,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	ApproveYoutubeChannelSyncItemsDto,
	QueryYoutubeChannelSyncItemsDto,
	RejectYoutubeChannelSyncItemDto,
} from '../dto/youtube-channel-sync.dto';
import { YoutubeChannelSyncService } from '../services/youtube-channel-sync.service';

@ApiTags('Admin - YouTube Channel Sync')
@Controller('admin/youtube-channel-sync-runs')
@SystemAdminOnly()
export class YoutubeChannelSyncController {
	constructor(private readonly syncService: YoutubeChannelSyncService) {}

	@Post()
	@ApiOperation({
		summary:
			'Start a background YouTube channel metadata sync into staging',
	})
	async start(@Req() req: Request) {
		const requestedBy = req.user!.sub || req.user!.id;
		const data = await this.syncService.startRun(requestedBy);
		return new ResponseSuccess({ data });
	}

	@Get()
	@ApiOperation({ summary: 'List recent YouTube channel sync runs' })
	async listRuns(
		@Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
	) {
		const data = await this.syncService.listRuns(limit);
		return new ResponseSuccess({ data });
	}

	@Get(':runId')
	@ApiOperation({
		summary: 'Get YouTube channel sync run progress and totals',
	})
	async findRun(@Param('runId', new ParseUUIDPipe()) runId: string) {
		const data = await this.syncService.findRun(runId);
		return new ResponseSuccess({ data });
	}

	@Get(':runId/items')
	@ApiOperation({
		summary: 'List staged per-channel sync results for review',
	})
	async listItems(
		@Param('runId', new ParseUUIDPipe()) runId: string,
		@Query() query: QueryYoutubeChannelSyncItemsDto,
	) {
		const data = await this.syncService.listItems(runId, query);
		return new ResponseSuccess({ data });
	}

	@Post('items/approve')
	@ApiOperation({
		summary: 'Approve and apply multiple pending channel updates',
	})
	async approveMany(
		@Body() dto: ApproveYoutubeChannelSyncItemsDto,
		@Req() req: Request,
	) {
		const reviewerId = req.user!.sub || req.user!.id;
		const data = await this.syncService.approveItems(dto, reviewerId);
		return new ResponseSuccess({ data });
	}

	@Post(':runId/approve-all')
	@ApiOperation({
		summary:
			'Approve and apply every pending changed channel in one sync run',
	})
	async approveAll(
		@Param('runId', new ParseUUIDPipe()) runId: string,
		@Req() req: Request,
	) {
		const reviewerId = req.user!.sub || req.user!.id;
		const data = await this.syncService.approveAll(runId, reviewerId);
		return new ResponseSuccess({ data });
	}

	@Post('items/:itemId/approve')
	@ApiOperation({ summary: 'Approve and apply one pending channel update' })
	async approveOne(
		@Param('itemId', new ParseUUIDPipe()) itemId: string,
		@Req() req: Request,
	) {
		const reviewerId = req.user!.sub || req.user!.id;
		const data = await this.syncService.approveItem(itemId, reviewerId);
		return new ResponseSuccess({ data });
	}

	@Post('items/:itemId/reject')
	@ApiOperation({ summary: 'Reject a pending staged channel update' })
	async reject(
		@Param('itemId', new ParseUUIDPipe()) itemId: string,
		@Body() dto: RejectYoutubeChannelSyncItemDto,
		@Req() req: Request,
	) {
		const reviewerId = req.user!.sub || req.user!.id;
		const data = await this.syncService.rejectItem(itemId, dto, reviewerId);
		return new ResponseSuccess({ data });
	}
}
