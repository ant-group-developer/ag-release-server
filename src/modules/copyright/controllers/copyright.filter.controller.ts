import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { CreateTrackScanStatusDto, QueryGetListFilter } from '../dtos/copryright.dto';
import { CopyrightService } from '../services/copyright.service';

@Controller('copyright/filter')
export class CopyrightFilterController {
	constructor(private readonly copyrightService: CopyrightService) { }

	@Post()
	async handleCreateFilter(@Body() data: CreateTrackScanStatusDto) {
		const result = await this.copyrightService.handleCreateFilter(data);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	async getListFilter(@Query() query: QueryGetListFilter) {
		const data = await this.copyrightService.getListFilter(query)

		return new ResponseSuccess({ data })
	}
}
