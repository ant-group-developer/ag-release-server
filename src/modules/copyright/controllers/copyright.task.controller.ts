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
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateTrackScanStatusDto,
	QueryGetListTask,
} from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/tasks')
export class CopyrightTaskController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	async handleCreateTask(
		@Body() data: CreateTrackScanStatusDto,
		@Req() req: Request,
	) {
		const userId = req.user!.sub;

		const result = await this.copyrightService.handleCreateTask(
			data,
			userId,
		);
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async getDetailTask(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.copyrightService.getDetailTask(id);

		return new ResponseSuccess({ data });
	}

	@Post(':id/cancel')
	async cancelScan(@Param('id', ParseUUIDPipe) id: string) {
		await this.copyrightService.cancelScan(id);
		return new ResponseSuccess({ message: 'Cancelled successfully' });
	}

	@Post(':id/re-scan')
	async reScan(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
		const userId = req.user!.sub;
		const result = await this.copyrightService.reScan(id, userId);
		return new ResponseSuccess({
			data: result,
			message: 'Re-scan successfully',
		});
	}

	@Get()
	async getListTask(@Query() query: QueryGetListTask) {
		const data = await this.copyrightService.getListTask(query);

		return new ResponseSuccess({ data });
	}
}
