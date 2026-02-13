// src/modules/external/isrc/isrc.controller.ts

import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
	CreateIsrcRequest,
	IsrcService,
	ListIsrcRequest,
} from './isrc.service';

@Controller('isrc')
export class IsrcController {
	constructor(private readonly isrcService: IsrcService) {}

	// GET /isrc
	@Get()
	async list(@Query() query: ListIsrcRequest, @Req() req: any) {
		return this.isrcService.list(query, req.headers.authorization);
	}

	// POST /isrc
	@Post()
	async create(@Body() body: CreateIsrcRequest, @Req() req: any) {
		return this.isrcService.create(body, req.headers.authorization);
	}

	// GET /isrc/prefix
	@Get('prefix')
	async listPrefix(@Query() query: any, @Req() req: any) {
		return this.isrcService.listPrefix(query, req.headers.authorization);
	}
}
