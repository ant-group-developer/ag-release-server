// isrc.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CreateIsrc, ListIsrcRequest } from './interfaces/isrc.grpc.interface';
import { ListPrefixIsrcDto } from './isrc.dto';
import { IsrcService } from './isrc.service';

@Controller('isrc')
export class IsrcController {
	constructor(private readonly isrcService: IsrcService) {}

	@Get()
	async list(@Query() query: ListIsrcRequest) {
		return new ResponseSuccess({
			data: await this.isrcService.list(query),
		});
	}

	@Post()
	async create(@Body() body: CreateIsrc) {
		const data = await this.isrcService.create(body);
		return new ResponseSuccess(data);
	}

	@Get('prefix')
	async listPrefix(@Query() query: ListPrefixIsrcDto) {
		return new ResponseSuccess({
			data: await this.isrcService.listPrefix(query),
		});
	}
}
