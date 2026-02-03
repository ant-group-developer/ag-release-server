import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { QueryGetListResultScan } from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/result')
export class CopyrightResultController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Get(':id')
	getOneResult(@Param('id', ParseUUIDPipe) id: string) {
		return new ResponseSuccess({
			data: this.copyrightService.getOneResult(id),
		});
	}

	@Get()
	getListResult(@Query() data: QueryGetListResultScan) {
		return new ResponseSuccess({
			data: this.copyrightService.getListResult(data),
		});
	}

	// function test
	@Get(':id/scan-by-business')
	testScanByBusiness(@Param('id', ParseUUIDPipe) id: string) {
		return new ResponseSuccess({
			data: this.copyrightService.testScanByBusiness(id),
		});
	}
}
