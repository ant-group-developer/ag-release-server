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
	TrackOriginTypeMessageCodeSuccess,
	TrackOriginTypeMessageError,
	TrackOriginTypeMessageSuccess,
} from './constants/track-origin-type.constant';
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
	): Promise<ResponseSuccess<TrackOriginType>> {
		const result = await this.trackOriginTypeService.create(
			createTrackOriginTypeDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackOriginTypeMessageCodeSuccess.CREATE,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a trackOriginType by ID' })
	@ApiResponse({
		status: 200,
		description: 'Successfully retrieved trackOriginType',
	})
	@ApiResponse({
		status: 404,
		description: TrackOriginTypeMessageError.NOT_FOUND,
	})
	async findOne(
		@Param('id') id: string,
	): Promise<ResponseSuccess<TrackOriginType>> {
		const result = await this.trackOriginTypeService.findOne(id);
		return new ResponseSuccess({ data: result });
	}

	@Get()
	@ApiOperation({ summary: 'Get a list of trackOriginTypes' })
	@ApiResponse({ status: 200, description: 'List of trackOriginTypes' })
	async getList(
		@Query() query: QueryGetListTrackOriginTypeDto,
	): Promise<ResponseSuccess<PageDto<TrackOriginType>>> {
		const result = await this.trackOriginTypeService.getList(query);
		return new ResponseSuccess({ data: result });
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update a trackOriginType by ID' })
	@ApiResponse({
		status: 200,
		description: TrackOriginTypeMessageSuccess.UPDATE,
	})
	@ApiResponse({
		status: 409,
		description:
			TrackOriginTypeMessageError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
	})
	@ApiResponse({
		status: 404,
		description: TrackOriginTypeMessageError.NOT_FOUND,
	})
	async update(
		@Param('id') id: string,
		@Body() updateTrackOriginTypeDto: UpdateTrackOriginTypeDto,
	): Promise<ResponseSuccess<TrackOriginType>> {
		const result = await this.trackOriginTypeService.update(
			id,
			updateTrackOriginTypeDto,
		);
		return new ResponseSuccess({
			data: result,
			messageCode: TrackOriginTypeMessageCodeSuccess.UPDATE,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete a trackOriginType by ID' })
	@ApiResponse({
		status: 200,
		description: TrackOriginTypeMessageSuccess.DELETE,
	})
	async remove(@Param('id') id: string): Promise<ResponseSuccess<void>> {
		await this.trackOriginTypeService.remove(id);
		return new ResponseSuccess({
			messageCode: TrackOriginTypeMessageCodeSuccess.DELETE,
		});
	}
}
