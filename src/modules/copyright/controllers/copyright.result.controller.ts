import { Controller, Get, Query } from '@nestjs/common';
import { QueryGetListResultScan } from '../dtos/copryright.dto';
import { CopyrightResultService } from '../services/sub-services/copyright.result.service';

@Controller('copyright/result')
export class CopyrightResultController {
	constructor(
		private readonly copyrightResultService: CopyrightResultService,
	) {}

	@Get()
	async getListResult(@Query() data: QueryGetListResultScan) {
		return await this.copyrightResultService.getListResult(data);
	}
}
