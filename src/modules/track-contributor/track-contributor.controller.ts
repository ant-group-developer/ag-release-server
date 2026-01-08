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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { TrackContributorResponseSuccess } from './constants/track-contributor.response';
import {
	CreateTrackContributorDto,
	QueryGetListTrackContributorDto,
	UpdateTrackContributorDto,
} from './dto/track-contributor.dto';
import { TrackContributorService } from './services/track-contributor.service';

@ApiTags('Track Contributors')
@Controller('track-contributors')
export class TrackContributorController {
	constructor(
		private readonly trackContributorService: TrackContributorService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create track contributor' })
	@ApiResponse({ status: 201 })
	async create(@Body() dto: CreateTrackContributorDto) {
		const result = await this.trackContributorService.create(dto);
		return TrackContributorResponseSuccess.CREATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get track contributor by id' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.trackContributorService.findOne(id);
		return TrackContributorResponseSuccess.FIND_ONE(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list track contributors' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	@ApiQuery({ name: 'trackId', required: false, type: String })
	@ApiResponse({ status: 200 })
	async getList(@Query() query: QueryGetListTrackContributorDto) {
		const result = await this.trackContributorService.getList(query);
		return TrackContributorResponseSuccess.GET_LIST(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update track contributor' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateTrackContributorDto,
	) {
		const result = await this.trackContributorService.update(id, dto);
		return TrackContributorResponseSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete track contributor' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.trackContributorService.delete(id);
		return TrackContributorResponseSuccess.DELETE();
	}
}
