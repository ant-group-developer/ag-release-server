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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';

import { TrackTypeMessageCodeSuccess } from './constants/track-type.constant';
import {
	CreateTrackTypeDto,
	QueryGetListTrackTypeDto,
	UpdateTrackTypeDto,
} from './dto/track-type.dto';
import { TrackType } from './entities/track-type.entity';
import { TrackTypeService } from './services/track-type.service';

@ApiTags('Track Types')
@Controller('track-types')
export class TrackTypeController {
	constructor(private readonly trackTypeService: TrackTypeService) {}

	@Post()
	async create(
		@Body() createTrackTypeDto: CreateTrackTypeDto,
	): Promise<ResponseSuccess<TrackType>> {
		const result = await this.trackTypeService.create(createTrackTypeDto);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackTypeMessageCodeSuccess.CREATE,
		});
	}

	@Get()
	async getList(
		@Query() query: QueryGetListTrackTypeDto,
	): Promise<ResponseSuccess<PageDto<TrackType>>> {
		const result = await this.trackTypeService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.trackTypeService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<TrackType>> {
		const result = await this.trackTypeService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateTrackTypeDto: UpdateTrackTypeDto,
	): Promise<ResponseSuccess<TrackType>> {
		const result = await this.trackTypeService.update(
			id,
			updateTrackTypeDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackTypeMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	async delete(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<void>> {
		await this.trackTypeService.delete(id);
		return new ResponseSuccess({
			messageCode: TrackTypeMessageCodeSuccess.DELETE,
		});
	}
}
