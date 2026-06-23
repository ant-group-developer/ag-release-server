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
import {
	ApiOperation,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';

import { VideoGenreSuccess } from './constants/video-genre.res';
import {
	BulkCreateVideoGenreDto,
	CreateVideoGenreDto,
	QueryGetListVideoGenreDto,
	UpdateVideoGenreDto,
} from './dto/video-genre.dto';
import { VideoGenreService } from './services/video-genre.service';

@ApiTags('Video Genres')
@Controller('video-genres')
export class VideoGenreController {
	constructor(private readonly videoGenreService: VideoGenreService) {}

	@Post()
	@ApiOperation({ summary: 'Create video genre' })
	@ApiResponse({ status: 201, description: 'Created' })
	async create(@Body() dto: CreateVideoGenreDto) {
		const result = await this.videoGenreService.create(dto);
		return VideoGenreSuccess.CREATE(result);
	}

	@Post('bulk')
	@ApiOperation({ summary: 'Bulk create video genres' })
	@ApiResponse({ status: 201, description: 'Created' })
	async bulkCreate(@Body() dto: BulkCreateVideoGenreDto) {
		const result = await this.videoGenreService.bulkCreate(dto);
		return VideoGenreSuccess.CREATE(result);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get video genre by id' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Success' })
	async findOne(@Param('id') id: string) {
		const result = await this.videoGenreService.findOne(id);
		return VideoGenreSuccess.COMMON(result);
	}

	@Get('video/:videoId')
	@ApiOperation({ summary: 'Get genres by video id' })
	@ApiParam({ name: 'videoId', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Success' })
	async getByVideoId(@Param('videoId') videoId: string) {
		const result = await this.videoGenreService.getByVideoId(videoId);
		return VideoGenreSuccess.COMMON(result);
	}

	@Get()
	@ApiOperation({ summary: 'Get list video genres' })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'pageSize', required: false, type: Number })
	async getList(@Query() query: QueryGetListVideoGenreDto) {
		const result = await this.videoGenreService.getList(query);
		return VideoGenreSuccess.COMMON(result);
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update video genre' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Updated' })
	async update(@Param('id') id: string, @Body() dto: UpdateVideoGenreDto) {
		const result = await this.videoGenreService.update(id, dto);
		return VideoGenreSuccess.UPDATE(result);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete video genre' })
	@ApiParam({ name: 'id', type: 'string', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Deleted' })
	async remove(@Param('id') id: string) {
		await this.videoGenreService.handleDelete(id);
		return VideoGenreSuccess.DELETE();
	}
}
