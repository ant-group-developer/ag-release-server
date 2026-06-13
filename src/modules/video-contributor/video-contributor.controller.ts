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
import { VideoContributorResponseSuccess } from './constants/video-contributor.response';
import {
	BulkCreateVideoContributorDto,
	CreateVideoContributorDto,
	QueryGetListVideoContributorDto,
	UpdateVideoContributorDto,
} from './dto/video-contributor.dto';
import { VideoContributorService } from './services/video-contributor.service';

@ApiTags('Video Contributors')
@Controller('video-contributors')
export class VideoContributorController {
	constructor(
		private readonly videoContributorService: VideoContributorService,
	) {}

	@Post()
	@ApiOperation({ summary: 'Create video contributor' })
	@ApiResponse({ status: 201 })
	async create(@Body() dto: CreateVideoContributorDto) {
		const result = await this.videoContributorService.create(dto);
		return VideoContributorResponseSuccess.CREATE(result);
	}

	@Post('bulk')
	@ApiOperation({ summary: 'Bulk create video contributors' })
	@ApiResponse({ status: 201, description: 'Created' })
	async bulkCreate(@Body() dto: BulkCreateVideoContributorDto) {
		const result = await this.videoContributorService.bulkCreate(dto);
		return VideoContributorResponseSuccess.CREATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get video contributor by id' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async findOne(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.videoContributorService.findOne(id);
		return VideoContributorResponseSuccess.FIND_ONE(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list video contributors' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	@ApiQuery({ name: 'videoId', required: false, type: String })
	@ApiResponse({ status: 200 })
	async getList(@Query() query: QueryGetListVideoContributorDto) {
		const result = await this.videoContributorService.getList(query);
		return VideoContributorResponseSuccess.GET_LIST(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update video contributor' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async update(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: UpdateVideoContributorDto,
	) {
		const result = await this.videoContributorService.update(id, dto);
		return VideoContributorResponseSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete video contributor' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200 })
	async remove(@Param('id', ParseUUIDPipe) id: string) {
		await this.videoContributorService.delete(id);
		return VideoContributorResponseSuccess.DELETE();
	}
}
