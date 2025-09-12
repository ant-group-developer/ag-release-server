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
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/response.dto';
import { TrackSensitiveMessage } from './constants/track-sensitive.const';
import {
	CreateTrackSensitiveDto,
	QueryGetListTrackSensitiveDto,
	UpdateTrackSensitiveDto,
} from './dtos/track-sensitive.dto';
import { TrackSensitive } from './entities/track-sensitive.entity';
import { TrackSensitiveService } from './services/track-sensitive.service';

@Controller('track-sensitives')
export class TrackSensitiveController {
	constructor(
		private readonly trackSensitiveService: TrackSensitiveService,
	) {}

	@Post()
	async create(
		@Body() data: CreateTrackSensitiveDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<TrackSensitive>> {
		const userId = req.user!.sub;
		const result = await this.trackSensitiveService.create(data, userId);
		return new ResponseSuccess({
			data: result,
			...TrackSensitiveMessage.CREATE,
		});
	}

	@Get()
	async getList(@Query() query: QueryGetListTrackSensitiveDto) {
		const result = await this.trackSensitiveService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Get('simple')
	async getListSimple() {
		const result = await this.trackSensitiveService.getListSimple();
		return new ResponseSuccess({ data: result });
	}

	@Get(':id')
	async findOne(
		@Param('id', ParseUUIDPipe) id: string,
	): Promise<ResponseSuccess<TrackSensitive>> {
		const result = await this.trackSensitiveService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() data: UpdateTrackSensitiveDto,
		@Req() req: Request,
	): Promise<ResponseSuccess<TrackSensitive>> {
		const userId = req.user!.sub;
		const result = await this.trackSensitiveService.update(
			id,
			data,
			userId,
		);
		return new ResponseSuccess({
			data: result,
			...TrackSensitiveMessage.UPDATE,
		});
	}

	@Delete(':id')
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.trackSensitiveService.delete(id);
		return new ResponseSuccess({ ...TrackSensitiveMessage.DELETE });
	}
}
