// logs.controller.ts

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { QueryGetListLogDto } from './dto/log.dto';
import { LogsService } from './services/logs.services';

@ApiTags('Logs')
@Controller('logs')
export class LogsController {
	constructor(private readonly logsService: LogsService) {}

	/** Lấy danh sách logs */
	@Get()
	@ApiOperation({ summary: 'Get logs' })
	@ApiResponse({ status: 200, description: 'Log list' })
	async getList(@Query() query: QueryGetListLogDto) {
		const result = await this.logsService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	/** Lấy chi tiết log */
	@Get('modules')
	@ApiOperation({ summary: 'Get log modules' })
	@ApiResponse({ status: 200, description: 'Log module list' })
	async getModules() {
		const result = await this.logsService.getModules();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get log detail' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Log detail' })
	async getDetail(@Param('id') id: string) {
		const result = await this.logsService.getDetail(id);
		return new ResponseSuccess({ data: result });
	}

	// /** Xóa log */
	// @Delete(':id')
	// async delete(@Param('id') id: string) {
	// 	const result = await this.logsService.delete(id);
	// 	return new ResponseSuccess({ data: result });
	// }
}
