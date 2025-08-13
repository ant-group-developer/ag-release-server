import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import {
	CreateTrackScanStatusDto,
	QueryGetListFilter,
} from '../dtos/copyright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/filter')
export class CopyrightFilterController {
	constructor(private readonly copyrightService: CopyrightService) {}

	@Post()
	async handleCreateFilter(@Body() data: CreateTrackScanStatusDto) {
		const result = await this.copyrightService.handleCreateFilter(data);
		return new ResponseSuccess({ data: result });
	}

	@Post(':id/cancel')
	async cancelScan(@Param('id') id: string) {
		await this.copyrightService.cancelScan(id);
		return new ResponseSuccess({ message: 'Cancelled successfully' });
	}

	@Post(':id/re-scan')
	async reScan(@Param('id') id: string) {
		await this.copyrightService.reScan(id);
		return new ResponseSuccess({ message: 'Re-scan successfully' });
	}

	@Get(':id')
	async getDetailFilter(@Param('id') id: string) {
		const data = await this.copyrightService.getDetailFilter(id);

		return new ResponseSuccess({ data });
	}

	@Get()
	async getListFilter(@Query() query: QueryGetListFilter) {
		const data = await this.copyrightService.getListFilter(query);

		return new ResponseSuccess({ data });
	}
}
