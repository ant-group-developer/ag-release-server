import { Controller, Get, Query } from '@nestjs/common';
import { QueryGetListResultScan } from '../dtos/copryright.dto';
import { CopyrightResultService } from '../services/sub-services/copyright.result.service';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/result')
export class CopyrightResultController {
	constructor(
		private readonly copyrightService: CopyrightService,
	) { }

	@Get()
	async getListResult(@Query() data: QueryGetListResultScan) {
		return await this.copyrightService.getListResult(data);
	}
}
