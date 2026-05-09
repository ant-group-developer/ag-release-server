// logs.controller.ts

import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { QueryGetListLogDto } from './dto/log.dto';
import { LogsService } from './services/logs.services';

@Controller('logs')
export class LogsController {
	constructor(private readonly logsService: LogsService) {}

	/** Lấy danh sách logs */
	@Get()
	async getList(@Query() query: QueryGetListLogDto) {
		const result = await this.logsService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết log */
	@Get(':id')
	async getDetail(@Param('id') id: string) {
		const result = await this.logsService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	/** Xóa log */
	@Delete(':id')
	async delete(@Param('id') id: string) {
		const result = await this.logsService.delete(id);
		return new ResponseSuccess({ data: result });
	}
}
