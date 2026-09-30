import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import {
	ApplyReleaseMergeItemsDto,
	QueryReleaseMergeItemDto,
} from '../dto/release-merge.dto';
import { ReleaseMergeScanService } from '../services/release-merge-scan.service';

@ApiTags('Release Merge')
@SystemAdminOnly()
@Controller('release-merges')
export class ReleaseMergeController {
	constructor(private readonly scanService: ReleaseMergeScanService) {}

	@Post('scans')
	@ApiOperation({
		summary: 'Scan toàn bộ track để tìm duplicate release candidates',
	})
	async scan(@Req() req: Request) {
		return new ResponseSuccess({
			data: await this.scanService.scanAll(req.user!.sub),
		});
	}

	@Get('scans')
	async list(@Query() query: BaseQueryDto) {
		return new ResponseSuccess({
			data: await this.scanService.listRuns(query),
		});
	}

	@Get('scans/:scanId')
	async detail(@Param('scanId', ParseUUIDPipe) scanId: string) {
		return new ResponseSuccess({
			data: await this.scanService.getRun(scanId),
		});
	}

	@Get('scans/:scanId/items')
	async items(
		@Param('scanId', ParseUUIDPipe) scanId: string,
		@Query() query: QueryReleaseMergeItemDto,
	) {
		return new ResponseSuccess({
			data: await this.scanService.listItems(scanId, query),
		});
	}

	@Get('scans/:scanId/items/:itemId')
	async item(
		@Param('scanId', ParseUUIDPipe) scanId: string,
		@Param('itemId', ParseUUIDPipe) itemId: string,
	) {
		return new ResponseSuccess({
			data: await this.scanService.getItem(scanId, itemId),
		});
	}

	@Post('scans/:scanId/apply')
	@ApiOperation({
		summary: 'Apply một số hoặc toàn bộ AUTO_SAFE merge items',
	})
	async apply(
		@Param('scanId', ParseUUIDPipe) scanId: string,
		@Body() dto: ApplyReleaseMergeItemsDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.scanService.startApply(scanId, dto, req.user!.sub),
		});
	}
}
