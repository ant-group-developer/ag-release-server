import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
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
	async handleCreateTask(@Body() data: CreateTrackScanStatusDto) {
		const result = await this.copyrightService.handleCreateTask(data);
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/cancel')
	async cancelScan(@Param('id', ParseUUIDPipe) id: string) {
		await this.copyrightService.cancelScan(id);
		return new ResponseSuccess({ message: 'Cancelled successfully' });
	}

	@Post(':id/re-scan')
	async reScan(@Param('id', ParseUUIDPipe) id: string) {
		await this.copyrightService.reScan(id);
		return new ResponseSuccess({ message: 'Re-scan successfully' });
	}

	@Get(':id')
	async getDetailTask(@Param('id', ParseUUIDPipe) id: string) {
		const data = await this.copyrightService.getDetailTask(id);

		return new ResponseSuccess({ data });
	}

	@Get()
	async getListTask(@Query() query: QueryGetListTask) {
		const data = await this.copyrightService.getListTask(query);

		return new ResponseSuccess({ data });
	}
}
