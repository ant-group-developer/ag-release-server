import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PageDto, ResponseSuccess } from 'src/common/dtos/response.dto';

import {
	TrackTypeMessageCodeSuccess,
	TrackTypeMessageError,
	TrackTypeMessageSuccess,
} from './constants/track-type.constant';
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

	@Get(':id')
	@ApiOperation({ summary: 'Get a trackType by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved trackType',
	})
	@ApiResponse({ status: 404, description: TrackTypeMessageError.NOT_FOUND })
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<TrackType>> {
		const result = await this.trackTypeService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of trackTypes' })
	@ApiResponse({ status: 200, description: 'List of trackTypes' })
	async getList(
		@Query() query: QueryGetListTrackTypeDto,
	): Promise<ResponseSuccess<PageDto<TrackType>>> {
		const result = await this.trackTypeService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a trackType by ID' })
	@ApiResponse({ status: 200, description: TrackTypeMessageSuccess.UPDATE })
	@ApiResponse({
		status: 409,
		description: TrackTypeMessageError.DUPLICATE_NAME_TRACK_TYPE,
	})
	@ApiResponse({ status: 404, description: TrackTypeMessageError.NOT_FOUND })
	async update(
		@Param('id') id: string,
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
	@ApiOperation({ summary: 'Delete a trackType by ID' })
	@ApiResponse({ status: 200, description: TrackTypeMessageSuccess.DELETE })
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.trackTypeService.remove(id);
		return new ResponseSuccess({
			messageCode: TrackTypeMessageCodeSuccess.DELETE,
		});
	}
}
