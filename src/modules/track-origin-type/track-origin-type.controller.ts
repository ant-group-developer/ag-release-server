import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';

import { Request } from 'express';
import { TrackOriginTypeMessageCodeSuccess } from './constants/track-origin-type.constant';
import {
	CreateTrackOriginTypeDto,
	QueryGetListTrackOriginTypeDto,
	UpdateTrackOriginTypeDto,
} from './dto/track-origin-type.dto';
import { TrackOriginType } from './entities/track-origin-type.entity';
import { TrackOriginTypeService } from './services/track-origin-type.service';

@ApiTags('Track origin type')
@Controller('track-origin-types')
export class TrackOriginTypeController {
	constructor(
		private readonly trackOriginTypeService: TrackOriginTypeService,
	) {}

	@Post()
	async create(
		@Body() createTrackOriginTypeDto: CreateTrackOriginTypeDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<TrackOriginType>> {
		const userId = req.user!.sub;
		const result = await this.trackOriginTypeService.create(
			createTrackOriginTypeDto,
			userId,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackOriginTypeMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	async getList(
		@Query() query: QueryGetListTrackOriginTypeDto,
	): Promise<ResponseSuccess<PageDto<TrackOriginType>>> {
		const result = await this.trackOriginTypeService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.trackOriginTypeService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<TrackOriginType>> {
		const result = await this.trackOriginTypeService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateTrackOriginTypeDto: UpdateTrackOriginTypeDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<TrackOriginType>> {
		const userId = req.user!.sub;
		const result = await this.trackOriginTypeService.update(
			id,
			updateTrackOriginTypeDto,
			userId,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackOriginTypeMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.trackOriginTypeService.delete(id);
		return new ResponseSuccess({
			messageCode: TrackOriginTypeMessageCodeSuccess.DELETE,
		});
	}
}
