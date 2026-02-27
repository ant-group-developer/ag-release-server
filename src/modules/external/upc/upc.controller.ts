import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';

import {
	CreateUpc,
	ListPrefixUpcRequest,
	QueryUpcRequest,
} from './upc.grpc.interface';
import { UpcService } from './upc.service';

@Controller('upc')
export class UpcController {
	constructor(private readonly upcService: UpcService) {}

	// GET /upc
	@Get()
	async list(@Query() query: QueryUpcRequest, @Req() req: any) {
		return this.upcService.list(query, req.headers.authorization);
	}

	// POST /upc
	@Post()
	async create(@Body() body: CreateUpc, @Req() req: any) {
		const data = await this.upcService.create(
			body,
			req.headers.authorization,
		);
		return new ResponseSuccess(data);
	}

	// GET /upc/prefix
	@Get('prefix')
	async listPrefix(@Query() query: ListPrefixUpcRequest, @Req() req: any) {
		return this.upcService.listPrefix(query);
	}
}
