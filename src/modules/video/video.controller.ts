import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiParam,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { CreateVideoDto, UpdateVideoDto } from './dto/video.dto';
import { VideoService } from './video.service';

@ApiTags('Videos')
@Controller('videos')
export class VideoController {
	constructor(private readonly videoService: VideoService) {}

	@Post()
	@ApiOperation({ summary: 'Create video metadata' })
	@ApiBody({ type: CreateVideoDto })
	@ApiResponse({ status: 201, description: 'Video metadata created' })
	async create(@Body() dto: CreateVideoDto) {
		const result = await this.videoService.create(dto);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get()
	@ApiOperation({ summary: 'Get all videos' })
	@ApiResponse({ status: 200, description: 'Video list' })
	async findAll() {
		const result = await this.videoService.findAll();

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('release/:releaseId')
	@ApiOperation({ summary: 'Get video metadata by release ID' })
	@ApiParam({ name: 'releaseId', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Video metadata' })
	async findByReleaseId(@Param('releaseId') releaseId: string) {
		const result = await this.videoService.findByReleaseId(releaseId);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get video metadata by ID' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Video metadata' })
	async findOne(@Param('id') id: string) {
		const result = await this.videoService.findOne(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Put(':id')
	@ApiOperation({ summary: 'Update video metadata' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiBody({ type: UpdateVideoDto })
	@ApiResponse({ status: 200, description: 'Video metadata updated' })
	async update(@Param('id') id: string, @Body() dto: UpdateVideoDto) {
		const result = await this.videoService.update(id, dto);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete video metadata' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiResponse({ status: 200, description: 'Video metadata deleted' })
	async remove(@Param('id') id: string) {
		const result = await this.videoService.remove(id);

		return new ResponseSuccess({
			data: result,
		});
	}
}
