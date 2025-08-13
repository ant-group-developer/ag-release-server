import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryGetListResultScan } from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/result')
export class CopyrightResultController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Get(':id')
	async getOneResult(@Param('id', ParseUUIDPipe) id: string) {
		return await this.copyrightService.getOneResult(id);
	}

	@Get()
	async getListResult(@Query() data: QueryGetListResultScan) {
		return await this.copyrightService.getListResult(data);
	}
}
