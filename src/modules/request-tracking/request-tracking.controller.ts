// request-tracking/controllers/request-tracking.controller.ts

import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { QueryGetListRequestLogDto } from './dto/request-log.dto';
import { RequestTrackingService } from './request-tracking.service';

@Controller('request-tracking')
export class RequestTrackingController {
	constructor(
		private readonly requestTrackingService: RequestTrackingService,
	) {}

	/** Lấy danh sách request logs */
	@Get()
	async getList(@Query() query: QueryGetListRequestLogDto) {
		const result = await this.requestTrackingService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết request log */
	@Get(':id')
	async getDetail(@Param('id') id: string) {
		const result = await this.requestTrackingService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	/** Xóa request log */
	@Delete(':id')
	async delete(@Param('id') id: string) {
		const result = await this.requestTrackingService.delete(id);
		return new ResponseSuccess({ data: result });
	}
}
