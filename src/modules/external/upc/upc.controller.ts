import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import { AppResponseSuccess } from 'src/app.const';
import { ListPrefixUpcDto } from './upc.dto';
import { CreateUpc, GetUpcRequest, QueryUpcRequest } from './upc.grpc.interface';
import { UpcService } from './upc.service';

@Controller('upc')
export class UpcController {
	constructor(private readonly upcService: UpcService) {}

	// GET /upc
	@Get()
	async list(@Query() query: QueryUpcRequest) {
		return this.upcService.list(query);
	}

	// POST /upc
	@Post()
	async create(@Body() body: CreateUpc) {
		const data = await this.upcService.create(body);
		return new ResponseSuccess(data);
	}

	// GET /upc/detail
	@Get('detail')
	async getUpc(@Query() query: GetUpcRequest) {
		const data = await this.upcService.getUpc(query);
		return new ResponseSuccess({data: data.upc});
	}

	// GET /upc/prefix
	@Get('prefix')
	async listPrefix(@Query() query: ListPrefixUpcDto) {
		const data = await this.upcService.listPrefix(query);
		return AppResponseSuccess.COMMON(data);
	}
}
